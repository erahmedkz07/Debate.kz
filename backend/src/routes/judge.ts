import { Router } from 'express'
import { z } from 'zod'
import type { User } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { toDay } from '../lib/dates.js'
import { badRequest, forbidden, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { isOrganizerOf, teamInclude, toDebate, toTeam } from '../services/tournaments.js'
import { BP_SIDES, rulesOf, sidesOf, type SideCode } from '../services/formats.js'
import { background, notify } from '../services/notify.js'

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
          closingProposition: { include: teamInclude },
          closingOpposition: { include: teamInclude },
        },
      },
    },
    orderBy: [{ debate: { round: { date: 'desc' } } }, { debate: { round: { number: 'desc' } } }],
  })
  res.json(links.map(({ debate: d, isChair }) => ({
    debate: toDebate(d, true),
    round: { id: d.round.id, tournamentId: d.round.tournamentId, number: d.round.number, name: d.round.name, motion: d.round.motion, status: d.round.status, date: toDay(d.round.date) },
    tournament: { id: d.round.tournament.id, name: d.round.tournament.name, city: d.round.tournament.city, format: d.round.tournament.format },
    proposition: toTeam(d.proposition),
    opposition: toTeam(d.opposition),
    ...(d.closingProposition && d.closingOpposition && { closingProposition: toTeam(d.closingProposition), closingOpposition: toTeam(d.closingOpposition) }),
    isChair,
  })))
})

// Who may open a ballot: a judge of this debate (to fill it in), the tournament's organizers or an admin (to read it).
// Judges send their own ballots. An organizer may also enter or correct a judge's ballot ("as" = that judge): a lost
// phone, a typo found after the round, a judge who left. Such a ballot is marked with the organizer's name and the
// judge is told. British Parliamentary: the panel confers and the chair sends the one agreed ballot; wings read it.
async function loadBallotContext(debateId: string, user: User, asJudgeId?: string) {
  const d = await prisma.debate.findUnique({
    where: { id: debateId },
    include: {
      round: { include: { tournament: { include: { scoringConfig: true } } } },
      proposition: { include: teamInclude },
      opposition: { include: teamInclude },
      closingProposition: { include: teamInclude },
      closingOpposition: { include: teamInclude },
      judges: { include: { judge: true }, orderBy: { isChair: 'desc' } },
      ballots: { include: { scores: true } },
    },
  })
  if (!d) throw notFound('debate_not_found')
  const manager = await isOrganizerOf(user, d.round.tournamentId)
  if (asJudgeId && !manager) throw forbidden('organizers_only')
  const mine = asJudgeId ? d.judges.find(j => j.judgeId === asJudgeId) : d.judges.find(j => j.judge.userId === user.id)
  if (asJudgeId && !mine) throw notFound('judge_not_on_panel')
  const myJudge = mine?.judge
  if (!myJudge && !manager) throw forbidden('not_on_panel')
  const rules = rulesOf(d.round.tournament.format)
  const teams: Record<SideCode, typeof d.proposition | null> = {
    proposition: d.proposition, opposition: d.opposition, closingProposition: d.closingProposition, closingOpposition: d.closingOpposition,
  }
  // who may send: every judge in two-team formats, only the chair in BP
  const canSubmit = !!mine && (rules.teams === 2 || mine.isChair)
  return { d, myJudge, rules, teams, sides: sidesOf(d.round.tournament.format), canSubmit, onBehalf: !!asJudgeId, manager }
}

const asParam = (req: { query: Record<string, unknown> }) => (typeof req.query.as === 'string' && req.query.as ? req.query.as : undefined)

judgeRouter.get('/ballots/:debateId', requireAuth(), async (req, res) => {
  const { d, myJudge, rules, teams, sides, canSubmit, onBehalf, manager } = await loadBallotContext(param(req, 'debateId'), req.user!, asParam(req))
  // organizers (and BP wings) read every judge's ballot as it was sent; a judge who sends one sees the form
  const speakerName = new Map(sides.flatMap(side => teams[side]!.speakers).map(s => [s.id, s.name]))
  const sideOrder = (x: SideCode) => BP_SIDES.indexOf(x)
  const panel = canSubmit ? undefined : d.judges.map(j => {
    const b = d.ballots.find(x => x.judgeId === j.judgeId)
    const total = (side: SideCode) => b ? b.scores.filter(s => s.side === side).reduce((sum, s) => sum + Number(s.score), 0) : 0
    return {
      judgeId: j.judgeId, name: j.judge.name, isChair: j.isChair, hasAccount: !!j.judge.userId,
      submittedAt: b?.submittedAt.toISOString(), winner: b?.winner, ...(b?.enteredBy && { enteredBy: b.enteredBy }),
      ...(b?.ranking.length && { ranking: b.ranking }),
      totals: b ? Object.fromEntries(sides.map(side => [side, total(side)])) : undefined,
      scores: b?.scores.sort((x, y) => sideOrder(x.side) - sideOrder(y.side) || x.position - y.position)
        .map(s => ({ side: s.side, position: s.position, speaker: speakerName.get(s.speakerId) ?? '', score: Number(s.score), feedback: s.feedback ?? undefined })),
    }
  })
  // the sheet follows the tournament's format and score ranges
  const cfg = d.round.tournament.scoringConfig
  // the form opens with the ballot already sent (the judge's own, or the one the organizer corrects)
  const sent = canSubmit && myJudge ? d.ballots.find(b => b.judgeId === myJudge.id) : undefined
  res.json({
    canSubmit,
    // organizers may correct the judges' ballots until the tournament is over
    canCorrect: manager && d.round.tournament.status !== 'finished' && d.round.status !== 'draft',
    ...(onBehalf && myJudge && { onBehalfOf: { judgeId: myJudge.id, name: myJudge.name } }),
    ...(sent && {
      sent: {
        winner: sent.winner, ...(sent.ranking.length && { ranking: sent.ranking }), ...(sent.enteredBy && { enteredBy: sent.enteredBy }),
        scores: Object.fromEntries(sent.scores.filter(s => s.position <= 3).map(s => [s.speakerId, Number(s.score)])),
        reply: Object.fromEntries(sent.scores.filter(s => s.position === 4).map(s => [s.side, Number(s.score)])),
        replySpeakers: Object.fromEntries(sent.scores.filter(s => s.position === 4).map(s => [s.side, s.speakerId])),
        feedback: Object.fromEntries(sent.scores.filter(s => s.feedback).map(s => [s.position === 4 ? `reply:${s.side}` : s.speakerId, s.feedback!])),
      },
    }),
    rules: {
      format: d.round.tournament.format, teams: rules.teams, speakers: rules.speakers, step: Number(cfg?.step ?? rules.step),
      speaker: [Number(cfg?.speakerMin ?? rules.speaker[0]), Number(cfg?.speakerMax ?? rules.speaker[1])],
      ...(rules.reply && { reply: { range: [Number(cfg?.replyMin ?? rules.reply.range[0]), Number(cfg?.replyMax ?? rules.reply.range[1])], by: rules.reply.by } }),
    },
    ...(panel && { panel }),
    tournament: { id: d.round.tournament.id, name: d.round.tournament.name },
    round: { id: d.round.id, tournamentId: d.round.tournamentId, number: d.round.number, name: d.round.name, motion: d.round.motion, status: d.round.status, date: toDay(d.round.date) },
    debate: toDebate(d, true),
    proposition: toTeam(d.proposition),
    opposition: toTeam(d.opposition),
    ...(d.closingProposition && d.closingOpposition && { closingProposition: toTeam(d.closingProposition), closingOpposition: toTeam(d.closingOpposition) }),
    judges: d.judges.map(j => ({ id: j.judge.id, tournamentId: j.judge.tournamentId, name: j.judge.name, institution: '', rating: j.judge.rating, isChair: j.isChair })),
  })
})

const sideEnum = z.enum(BP_SIDES)
const ballotSchema = z.object({
  // two-team formats: the winner; BP: optionally the ranking 1st–4th the judge saw (checked against the scores)
  winner: sideEnum.optional(),
  ranking: z.array(sideEnum).length(4).optional(),
  scores: z.record(z.string(), z.number()), // speakerId -> substantive score
  // formats without reply speeches (Karl Popper) send neither
  reply: z.object({ proposition: z.number(), opposition: z.number() }).optional(),
  replySpeakers: z.object({ proposition: z.string(), opposition: z.string() }).optional(),
  // optional short written comments: speakerId -> text for substantive speeches, "reply:<side>" for replies
  feedback: z.record(z.string(), z.string().trim().max(400)).optional(),
  asJudgeId: z.string().optional(), // an organizer enters or corrects this judge's ballot
})

judgeRouter.post('/ballots/:debateId', requireAuth(), async (req, res) => {
  const data = body(req, ballotSchema)
  const { d, myJudge, rules, teams, sides, canSubmit, onBehalf } = await loadBallotContext(param(req, 'debateId'), req.user!, data.asJudgeId)
  // a judge sends their own ballot; an organizer may send it for a judge of the panel (asJudgeId)
  if (!myJudge) throw forbidden('judges_only')
  // BP: the panel agrees and the chair sends the one ballot
  if (!canSubmit) throw forbidden('chair_only')
  if (d.round.status === 'draft') throw badRequest('round_not_released')
  if (onBehalf) {
    // an organizer corrects ballots until the tournament is over; in the playoffs, until the next stage is drawn
    if (d.round.tournament.status === 'finished') throw forbidden('tournament_finished')
    if (d.round.kind === 'elimination' && await prisma.debate.count({
      where: { round: { tournamentId: d.round.tournamentId, kind: 'elimination', category: d.round.category, number: { gt: d.round.number } } },
    })) throw forbidden('later_round_drawn')
  } else if (d.round.status === 'completed' || d.ballotStatus === 'confirmed') throw forbidden('ballot_locked')
  const judgeId = myJudge.id

  // ---- server-side validation by the tournament's format (never trust the client) ----
  const cfg = d.round.tournament.scoringConfig
  const [sMin, sMax, rMin, rMax, step] = cfg
    ? [cfg.speakerMin, cfg.speakerMax, cfg.replyMin, cfg.replyMax, cfg.step].map(Number)
    : [rules.speaker[0], rules.speaker[1], rules.reply?.range[0] ?? 0, rules.reply?.range[1] ?? 0, rules.step]
  const onStep = (v: number) => Math.abs(v / step - Math.round(v / step)) < 1e-9
  const totals = Object.fromEntries(sides.map(side => [side, 0])) as Record<SideCode, number>
  const rows: { speakerId: string; side: SideCode; position: number; score: number; feedback: string | null }[] = []
  const note = (key: string) => data.feedback?.[key] || null

  for (const side of sides) {
    const team = teams[side]!
    if (team.speakers.length !== rules.speakers) throw badRequest('team_incomplete')
    for (const s of team.speakers) {
      const v = data.scores[s.id]
      if (typeof v !== 'number' || v < sMin || v > sMax || !onStep(v)) throw badRequest('speaker_score_out_of_range', { speakerId: s.id })
      totals[side] += v
      rows.push({ speakerId: s.id, side, position: s.position, score: v, feedback: note(s.id) })
    }
    if (!rules.reply) continue
    // reply speech: only the speakers the format allows (WSDC: 1st or 2nd, APF: the leader)
    const replyBy = data.replySpeakers?.[side as 'proposition' | 'opposition']
    if (!team.speakers.some(s => s.id === replyBy && rules.reply!.by.includes(s.position))) throw badRequest('invalid_reply_speaker')
    const r = data.reply?.[side as 'proposition' | 'opposition']
    if (typeof r !== 'number' || r < rMin || r > rMax || !onStep(r)) throw badRequest('reply_score_out_of_range')
    totals[side] += r
    rows.push({ speakerId: replyBy!, side, position: 4, score: r, feedback: note(`reply:${side}`) })
  }
  // no ties: the places follow the team totals (in BP too — the higher total takes the higher place)
  if (new Set(sides.map(side => totals[side])).size !== sides.length) throw badRequest('tie_not_allowed')
  const ranking = [...sides].sort((a, b) => totals[b] - totals[a])
  if (rules.teams === 4 && data.ranking && data.ranking.join() !== ranking.join()) throw badRequest('ranking_mismatch')
  if ((rules.teams === 2 || data.winner) && data.winner !== ranking[0]) throw badRequest('winner_mismatch')
  const winner = ranking[0]

  await prisma.$transaction(async tx => {
    // re-submitting replaces this judge's previous ballot
    await tx.ballot.deleteMany({ where: { debateId: d.id, judgeId } })
    await tx.ballot.create({ data: { debateId: d.id, judgeId, winner, ranking: rules.teams === 4 ? ranking : [], enteredBy: onBehalf ? req.user!.name : null, scores: { create: rows } } })
    // a completed round stays confirmed; its table follows the corrected ballot
    const ballotStatus = d.round.status === 'completed' ? 'confirmed' : 'submitted'
    if (rules.teams === 4) {
      // BP: the chair's agreed ballot is the result
      await tx.debate.update({ where: { id: d.id }, data: { ballotStatus, winner, ranking } })
      return
    }

    // judges vote individually: when the whole panel has voted, the majority decides
    const ballots = await tx.ballot.findMany({ where: { debateId: d.id }, select: { winner: true, judgeId: true } })
    if (ballots.length >= d.judges.length) {
      const prop = ballots.filter(b => b.winner === 'proposition').length
      const opp = ballots.length - prop
      // split panel (even size): the chair's ballot decides
      const chairId = d.judges.find(j => j.isChair)?.judgeId
      const winner = prop !== opp ? (prop > opp ? 'proposition' : 'opposition') : ballots.find(b => b.judgeId === chairId)!.winner
      await tx.debate.update({ where: { id: d.id }, data: { ballotStatus, winner } })
    }
  })
  // the judge learns that an organizer entered or corrected their ballot
  if (onBehalf && myJudge.userId) {
    background(notify([myJudge.userId], 'judge.ballotEdited', { tournament: d.round.tournament.name, round: d.round.name, room: d.room, by: req.user!.name }, `/ballot/${d.id}`))
  }
  res.status(201).json({ ok: true, totals, ...(rules.teams === 4 && { ranking }) })
})
