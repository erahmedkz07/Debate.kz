import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { toDay } from '../lib/dates.js'
import { badRequest, forbidden, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { isOrganizerOf, toTeam } from '../services/tournaments.js'

export const judgeRouter = Router()

const teamInclude = { institution: true, speakers: { orderBy: { position: 'asc' as const } } }

// all debates where the signed-in user sits on the panel
judgeRouter.get('/judge/assignments', requireAuth('judge', 'admin'), async (req, res) => {
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

// who may open a ballot: a judge of this debate, the tournament's organizer, or an admin
async function loadBallotContext(debateId: string, userId: string, role: string) {
  const d = await prisma.debate.findUnique({
    where: { id: debateId },
    include: {
      round: { include: { tournament: { include: { scoringConfig: true } } } },
      proposition: { include: teamInclude },
      opposition: { include: teamInclude },
      judges: { include: { judge: true }, orderBy: { isChair: 'desc' } },
    },
  })
  if (!d) throw notFound('debate_not_found')
  const myJudge = d.judges.find(j => j.judge.userId === userId)?.judge
  const manager = await isOrganizerOf({ id: userId, role } as never, d.round.tournamentId)
  if (!myJudge && !manager) throw forbidden('not_on_panel')
  return { d, myJudge }
}

judgeRouter.get('/ballots/:debateId', requireAuth('judge', 'organizer', 'admin'), async (req, res) => {
  const { d } = await loadBallotContext(param(req, 'debateId'), req.user!.id, req.user!.role)
  res.json({
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
  reply: z.object({ proposition: z.number(), opposition: z.number() }),
  replySpeakers: z.object({ proposition: z.string(), opposition: z.string() }),
})

judgeRouter.post('/ballots/:debateId', requireAuth('judge', 'organizer', 'admin'), async (req, res) => {
  const data = body(req, ballotSchema)
  const { d, myJudge } = await loadBallotContext(param(req, 'debateId'), req.user!.id, req.user!.role)
  if (d.round.status === 'draft') throw badRequest('round_not_released')
  if (d.round.status === 'completed' || d.ballotStatus === 'confirmed') throw forbidden('ballot_locked')
  // organizers/admins submit on behalf of the chair when they are not on the panel themselves
  const judgeId = myJudge?.id ?? d.judges[0]?.judgeId
  if (!judgeId) throw badRequest('no_panel')

  // ---- server-side WSDC validation (never trust the client) ----
  const cfg = d.round.tournament.scoringConfig
  const [sMin, sMax, rMin, rMax, step] = cfg
    ? [cfg.speakerMin, cfg.speakerMax, cfg.replyMin, cfg.replyMax, cfg.step].map(Number)
    : [60, 80, 30, 40, 0.5]
  const onStep = (v: number) => Math.abs(v / step - Math.round(v / step)) < 1e-9
  const sides = { proposition: d.proposition, opposition: d.opposition } as const
  const totals = { proposition: 0, opposition: 0 }
  const rows: { speakerId: string; side: 'proposition' | 'opposition'; position: number; score: number }[] = []

  for (const side of ['proposition', 'opposition'] as const) {
    const team = sides[side]
    if (team.speakers.length !== 3) throw badRequest('team_incomplete')
    for (const s of team.speakers) {
      const v = data.scores[s.id]
      if (typeof v !== 'number' || v < sMin || v > sMax || !onStep(v)) throw badRequest('speaker_score_out_of_range', { speakerId: s.id })
      totals[side] += v
      rows.push({ speakerId: s.id, side, position: s.position, score: v })
    }
    // reply speech: only the 1st or 2nd speaker may give it
    const replyBy = data.replySpeakers[side]
    if (!team.speakers.slice(0, 2).some(s => s.id === replyBy)) throw badRequest('invalid_reply_speaker')
    const r = data.reply[side]
    if (r < rMin || r > rMax || !onStep(r)) throw badRequest('reply_score_out_of_range')
    totals[side] += r
    rows.push({ speakerId: replyBy, side, position: 4, score: r })
  }
  if (totals.proposition === totals.opposition) throw badRequest('tie_not_allowed')
  const higher = totals.proposition > totals.opposition ? 'proposition' : 'opposition'
  if (data.winner !== higher) throw badRequest('winner_mismatch')

  await prisma.$transaction(async tx => {
    // re-submitting replaces this judge's previous ballot
    await tx.ballot.deleteMany({ where: { debateId: d.id, judgeId } })
    await tx.ballot.create({ data: { debateId: d.id, judgeId, winner: data.winner, scores: { create: rows } } })

    // when the whole panel has voted, the majority decides the debate
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
