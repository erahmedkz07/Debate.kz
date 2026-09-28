import { Router } from 'express'
import { z } from 'zod'
import type { User } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { toDay } from '../lib/dates.js'
import { badRequest, forbidden, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { isOrganizerOf, teamInclude, toTeam } from '../services/tournaments.js'
import { rulesOf } from '../services/formats.js'

export const judgeRouter = Router()


// all debates where the signed-in user sits on the panel
judgeRouter.get('/judge/assignments', requireAuth(), async (req, res) => {
  const links = await prisma.debateJudge.findMany({
    where: { judge: { userId: req.user!.id }, debate: { round: { status: { not: 'draft' } } } },
    include: {
      debate: {
        include: {
          judges: { orderBy: { isChair: 'desc' } },
          round: { include: { tournament: true } },
          proposition: { include: teamInclude },
          opposition: { include: teamInclude },
        },
      },
    },
    orderBy: [{ debate: { round: { date: 'desc' } } }, { debate: { round: { number: 'desc' } } }],
  })
  res.json(links.map(({ debate: d, isChair }) => ({
    debate: {
      id: d.id, roundId: d.roundId, room: d.room, propositionTeamId: d.propositionTeamId, oppositionTeamId: d.oppositionTeamId,
      judgeIds: d.judges.map(j => j.judgeId), winner: d.winner ?? undefined, ballotStatus: d.ballotStatus,
    },
    round: { id: d.round.id, tournamentId: d.round.tournamentId, number: d.round.number, name: d.round.name, motion: d.round.motion, status: d.round.status, date: toDay(d.round.date) },
    tournament: { id: d.round.tournament.id, name: d.round.tournament.name, city: d.round.tournament.city },
    proposition: toTeam(d.proposition),
    opposition: toTeam(d.opposition),
    isChair,
  })))
})

// Who may open a ballot: a judge of this debate (to fill it in), the tournament's organizers or an admin (to read it).
// Only the judges themselves submit ballots: organizers see the scores and who has voted, and cannot change them.
async function loadBallotContext(debateId: string, user: User) {
  const d = await prisma.debate.findUnique({
    where: { id: debateId },
    include: {
      round: { include: { tournament: { include: { scoringConfig: true } } } },
      proposition: { include: teamInclude },
      opposition: { include: teamInclude },
      judges: { include: { judge: true }, orderBy: { isChair: 'desc' } },
      ballots: { include: { scores: true } },
    },
  })
  if (!d) throw notFound('debate_not_found')
  const myJudge = d.judges.find(j => j.judge.userId === user.id)?.judge
  const manager = await isOrganizerOf(user, d.round.tournamentId)
  if (!myJudge && !manager) throw forbidden('not_on_panel')
  return { d, myJudge }
}

judgeRouter.get('/ballots/:debateId', requireAuth(), async (req, res) => {
  const { d, myJudge } = await loadBallotContext(param(req, 'debateId'), req.user!)
  // organizers read every judge's ballot as it was sent; a judge sees only the form
  const speakerName = new Map([...d.proposition.speakers, ...d.opposition.speakers].map(s => [s.id, s.name]))
  const panel = myJudge ? undefined : d.judges.map(j => {
    const b = d.ballots.find(x => x.judgeId === j.judgeId)
    const total = (side: 'proposition' | 'opposition') => b ? b.scores.filter(s => s.side === side).reduce((sum, s) => sum + Number(s.score), 0) : 0
    return {
      judgeId: j.judgeId, name: j.judge.name, isChair: j.isChair, hasAccount: !!j.judge.userId,
      submittedAt: b?.submittedAt.toISOString(), winner: b?.winner,
      totals: b ? { proposition: total('proposition'), opposition: total('opposition') } : undefined,
      scores: b?.scores.sort((x, y) => x.side.localeCompare(y.side) || x.position - y.position)
        .map(s => ({ side: s.side, position: s.position, speaker: speakerName.get(s.speakerId) ?? '', score: Number(s.score), feedback: s.feedback ?? undefined })),
    }
  })
  // the sheet follows the tournament's format and score ranges
  const rules = rulesOf(d.round.tournament.format)
  const cfg = d.round.tournament.scoringConfig
  res.json({
    canSubmit: !!myJudge,
    rules: {
      format: d.round.tournament.format, speakers: rules.speakers, step: Number(cfg?.step ?? rules.step),
      speaker: [Number(cfg?.speakerMin ?? rules.speaker[0]), Number(cfg?.speakerMax ?? rules.speaker[1])],
      ...(rules.reply && { reply: { range: [Number(cfg?.replyMin ?? rules.reply.range[0]), Number(cfg?.replyMax ?? rules.reply.range[1])], by: rules.reply.by } }),
    },
    ...(panel && { panel }),
    tournament: { id: d.round.tournament.id, name: d.round.tournament.name },
    round: { id: d.round.id, tournamentId: d.round.tournamentId, number: d.round.number, name: d.round.name, motion: d.round.motion, status: d.round.status, date: toDay(d.round.date) },
    debate: { id: d.id, roundId: d.roundId, room: d.room, propositionTeamId: d.propositionTeamId, oppositionTeamId: d.oppositionTeamId, judgeIds: d.judges.map(j => j.judgeId), winner: d.winner ?? undefined, ballotStatus: d.ballotStatus },
    proposition: toTeam(d.proposition),
    opposition: toTeam(d.opposition),
    judges: d.judges.map(j => ({ id: j.judge.id, tournamentId: j.judge.tournamentId, name: j.judge.name, institution: '', rating: j.judge.rating, isChair: j.isChair })),
  })
})

const ballotSchema = z.object({
  winner: z.enum(['proposition', 'opposition']),
  scores: z.record(z.string(), z.number()), // speakerId -> substantive score
  // formats without reply speeches (Karl Popper) send neither
  reply: z.object({ proposition: z.number(), opposition: z.number() }).optional(),
  replySpeakers: z.object({ proposition: z.string(), opposition: z.string() }).optional(),
  // optional short written comments: speakerId -> text for substantive speeches, "reply:<side>" for replies
  feedback: z.record(z.string(), z.string().trim().max(400)).optional(),
})

judgeRouter.post('/ballots/:debateId', requireAuth(), async (req, res) => {
  const { d, myJudge } = await loadBallotContext(param(req, 'debateId'), req.user!)
  // tournament rules: a ballot is the judge's own decision; organizers and admins only read it (checked before the form)
  if (!myJudge) throw forbidden('judges_only')
  const data = body(req, ballotSchema)
  if (d.round.status === 'draft') throw badRequest('round_not_released')
  if (d.round.status === 'completed' || d.ballotStatus === 'confirmed') throw forbidden('ballot_locked')
  const judgeId = myJudge.id

  // ---- server-side validation by the tournament's format (never trust the client) ----
  const rules = rulesOf(d.round.tournament.format)
  const cfg = d.round.tournament.scoringConfig
  const [sMin, sMax, rMin, rMax, step] = cfg
    ? [cfg.speakerMin, cfg.speakerMax, cfg.replyMin, cfg.replyMax, cfg.step].map(Number)
    : [rules.speaker[0], rules.speaker[1], rules.reply?.range[0] ?? 0, rules.reply?.range[1] ?? 0, rules.step]
  const onStep = (v: number) => Math.abs(v / step - Math.round(v / step)) < 1e-9
  const sides = { proposition: d.proposition, opposition: d.opposition } as const
  const totals = { proposition: 0, opposition: 0 }
  const rows: { speakerId: string; side: 'proposition' | 'opposition'; position: number; score: number; feedback: string | null }[] = []
  const note = (key: string) => data.feedback?.[key] || null

  for (const side of ['proposition', 'opposition'] as const) {
    const team = sides[side]
    if (team.speakers.length !== rules.speakers) throw badRequest('team_incomplete')
    for (const s of team.speakers) {
      const v = data.scores[s.id]
      if (typeof v !== 'number' || v < sMin || v > sMax || !onStep(v)) throw badRequest('speaker_score_out_of_range', { speakerId: s.id })
      totals[side] += v
      rows.push({ speakerId: s.id, side, position: s.position, score: v, feedback: note(s.id) })
    }
    if (!rules.reply) continue
    // reply speech: only the speakers the format allows (WSDC: 1st or 2nd, APF: the leader)
    const replyBy = data.replySpeakers?.[side]
    if (!team.speakers.some(s => s.id === replyBy && rules.reply!.by.includes(s.position))) throw badRequest('invalid_reply_speaker')
    const r = data.reply?.[side]
    if (typeof r !== 'number' || r < rMin || r > rMax || !onStep(r)) throw badRequest('reply_score_out_of_range')
    totals[side] += r
    rows.push({ speakerId: replyBy!, side, position: 4, score: r, feedback: note(`reply:${side}`) })
  }
  if (totals.proposition === totals.opposition) throw badRequest('tie_not_allowed')
  const higher = totals.proposition > totals.opposition ? 'proposition' : 'opposition'
  if (data.winner !== higher) throw badRequest('winner_mismatch')

  await prisma.$transaction(async tx => {
    // re-submitting replaces this judge's previous ballot
    await tx.ballot.deleteMany({ where: { debateId: d.id, judgeId } })
    await tx.ballot.create({ data: { debateId: d.id, judgeId, winner: data.winner, scores: { create: rows } } })

    // judges vote individually: when the whole panel has voted, the majority decides
    const ballots = await tx.ballot.findMany({ where: { debateId: d.id }, select: { winner: true, judgeId: true } })
    if (ballots.length >= d.judges.length) {
      const prop = ballots.filter(b => b.winner === 'proposition').length
      const opp = ballots.length - prop
      // split panel (even size): the chair's ballot decides
      const chairId = d.judges.find(j => j.isChair)?.judgeId
      const winner = prop !== opp ? (prop > opp ? 'proposition' : 'opposition') : ballots.find(b => b.judgeId === chairId)!.winner
      await tx.debate.update({ where: { id: d.id }, data: { ballotStatus: 'submitted', winner } })
    }
  })
  res.status(201).json({ ok: true, totals })
})
