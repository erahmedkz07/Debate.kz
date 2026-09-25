import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { toDay } from '../lib/dates.js'
import { badRequest, forbidden, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { assertCanManage } from '../services/tournaments.js'
import { fairAverage, judgeProfile, levelsForJudges } from '../services/judgeLevels.js'

export const feedbackRouter = Router()

// teams may rate their judges for 14 days after the result (the latest ballot)
const FEEDBACK_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const windowOpen = (lastBallot: Date | undefined) => !!lastBallot && Date.now() - lastBallot.getTime() <= FEEDBACK_WINDOW_MS

const debateInclude = {
  round: { include: { tournament: { select: { id: true, name: true } } } },
  proposition: { select: { id: true, name: true } },
  opposition: { select: { id: true, name: true } },
  judges: { include: { judge: { select: { id: true, name: true } } }, orderBy: { isChair: 'desc' as const } },
  ballots: { select: { submittedAt: true }, orderBy: { submittedAt: 'desc' as const }, take: 1 },
}

// debates of the user's teams that can be rated now, with what this team already gave
feedbackRouter.get('/me/feedback', requireAuth(), async (req, res) => {
  const speakers = await prisma.speaker.findMany({ where: { userId: req.user!.id }, select: { teamId: true } })
  const teamIds = speakers.map(s => s.teamId)
  const debates = await prisma.debate.findMany({
    where: { winner: { not: null }, OR: [{ propositionTeamId: { in: teamIds } }, { oppositionTeamId: { in: teamIds } }] },
    include: { ...debateInclude, feedback: { where: { teamId: { in: teamIds } } } },
    orderBy: [{ round: { date: 'desc' } }, { round: { number: 'desc' } }],
  })
  res.json(debates.filter(d => windowOpen(d.ballots[0]?.submittedAt) && d.judges.length).map(d => {
    const side = teamIds.includes(d.propositionTeamId) ? 'proposition' : 'opposition'
    return {
      debateId: d.id,
      tournament: d.round.tournament,
      round: { number: d.round.number, name: d.round.name, date: toDay(d.round.date) },
      opponent: side === 'proposition' ? d.opposition : d.proposition,
      result: d.winner === side ? 'win' : 'loss',
      judges: d.judges.map(j => {
        const given = d.feedback.find(f => f.judgeId === j.judgeId)
        return { judgeId: j.judgeId, name: j.judge.name, isChair: j.isChair, given: given ? { score: given.score, comment: given.comment ?? undefined } : undefined }
      }),
    }
  }))
})

// one score per team, judge and debate; the team can change it while the window is open
feedbackRouter.post('/debates/:debateId/feedback', requireAuth(), requireVerified, async (req, res) => {
  const d = body(req, z.object({ judgeId: z.string(), score: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() }))
  const debate = await prisma.debate.findUnique({ where: { id: param(req, 'debateId') }, include: debateInclude })
  if (!debate) throw notFound('debate_not_found')
  // only speakers of the two teams in this very debate
  const mine = await prisma.speaker.findFirst({ where: { userId: req.user!.id, teamId: { in: [debate.propositionTeamId, debate.oppositionTeamId] } } })
  if (!mine) throw forbidden('not_in_debate')
  if (!debate.winner) throw badRequest('no_result_yet')
  if (!windowOpen(debate.ballots[0]?.submittedAt)) throw forbidden('feedback_closed')
  if (!debate.judges.some(j => j.judgeId === d.judgeId)) throw badRequest('invalid_judge')
  const side = mine.teamId === debate.propositionTeamId ? 'proposition' : 'opposition'
  const key = { debateId_judgeId_teamId: { debateId: debate.id, judgeId: d.judgeId, teamId: mine.teamId } }
  const data = { score: d.score, comment: d.comment || null, fromUserId: req.user!.id }
  await prisma.judgeFeedback.upsert({
    where: key,
    update: data,
    create: { ...data, debateId: debate.id, judgeId: d.judgeId, teamId: mine.teamId, teamWon: debate.winner === side },
  })
  res.status(201).json({ ok: true })
})

// the judge's own level and progress (aggregates only, never individual scores)
feedbackRouter.get('/judge/profile', requireAuth(), async (req, res) => {
  res.json(await judgeProfile(req.user!.id))
})

// organizers see every judge of their tournament: level, team feedback with comments, their own review
feedbackRouter.get('/tournaments/:id/judge-feedback', requireAuth(), async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  const judges = await prisma.judge.findMany({
    where: { tournamentId: param(req, 'id') },
    include: {
      review: true,
      feedback: { include: { team: { select: { name: true } }, debate: { select: { round: { select: { number: true, name: true } } } } }, orderBy: { createdAt: 'desc' } },
      _count: { select: { debates: true } },
    },
    orderBy: [{ rating: 'desc' }, { name: 'asc' }],
  })
  const levels = await levelsForJudges(judges)
  res.json(judges.map(j => ({
    judgeId: j.id,
    level: levels.get(j.id),
    debates: j._count.debates,
    feedbackCount: j.feedback.length,
    feedbackAvg: j.feedback.length ? Math.round((fairAverage(j.feedback) ?? 0) * 100) / 100 : null,
    review: j.review?.score,
    items: j.feedback.map(f => ({ score: f.score, comment: f.comment ?? undefined, teamWon: f.teamWon, team: f.team.name, round: f.debate.round.name })),
  })))
})

// the organizer's 1..5 rating of a judge for this tournament (only for judges who actually judged)
feedbackRouter.put('/judges/:judgeId/review', requireAuth(), async (req, res) => {
  const { score } = body(req, z.object({ score: z.number().int().min(1).max(5) }))
  const judge = await prisma.judge.findUnique({ where: { id: param(req, 'judgeId') }, include: { _count: { select: { debates: true } } } })
  if (!judge) throw notFound('judge_not_found')
  await assertCanManage(req.user, judge.tournamentId)
  if (!judge._count.debates) throw badRequest('judge_not_judged_yet')
  await prisma.judgeReview.upsert({
    where: { judgeId: judge.id },
    update: { score, byUserId: req.user!.id },
    create: { judgeId: judge.id, score, byUserId: req.user!.id },
  })
  res.json({ judgeId: judge.id, score })
})
