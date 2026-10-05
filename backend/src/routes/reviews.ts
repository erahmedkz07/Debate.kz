import { Router } from 'express'
import { z } from 'zod'
import type { User } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { badRequest, forbidden, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { isOrganizerOf, publicWhere } from '../services/tournaments.js'
import { background, notify } from '../services/notify.js'

// Reviews of a finished tournament, like rating a ride: when the organizer finishes the tournament, its speakers and
// judges are asked to rate it 1–5 with an optional comment. The rating is public (the tournament page, and the
// organizer's average across their tournaments). Reviews carry the author's name and role, so a review is someone's
// word, not an anonymous one; the organizers can answer each review publicly, and the author is told.
export const reviewsRouter = Router()

// who took part: a speaker of one of its teams, or a judge
async function roleIn(user: User, tournamentId: string): Promise<'speaker' | 'judge' | null> {
  const [speaker, judge] = await Promise.all([
    prisma.speaker.findFirst({ where: { userId: user.id, team: { tournamentId, swing: false } } }),
    prisma.judge.findFirst({ where: { userId: user.id, tournamentId } }),
  ])
  return speaker ? 'speaker' : judge ? 'judge' : null
}

const round1 = (n: number) => Math.round(n * 10) / 10

// the average of a set of reviews and how the scores spread (5 stars … 1 star)
export function summarize(scores: number[]) {
  return {
    count: scores.length,
    average: scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    spread: [5, 4, 3, 2, 1].map(n => scores.filter(s => s === n).length),
  }
}

reviewsRouter.get('/tournaments/:id/reviews', async (req, res) => {
  const t = await prisma.tournament.findFirst({ where: { id: param(req, 'id'), ...publicWhere }, include: { organizers: { where: { role: 'owner' } } } })
  if (!t) throw notFound('tournament_not_found')
  const reviews = await prisma.tournamentReview.findMany({ where: { tournamentId: t.id }, include: { user: { select: { id: true, name: true, avatarUrl: true } } }, orderBy: { createdAt: 'desc' } })
  // the organizer's reputation: all reviews of the tournaments they own
  const ownerId = t.organizers[0]?.userId
  const ownerScores = ownerId
    ? (await prisma.tournamentReview.findMany({ where: { tournament: { organizers: { some: { userId: ownerId, role: 'owner' } } } }, select: { score: true } })).map(r => r.score)
    : []
  const me = req.user
  const myRole = me && t.status === 'finished' ? await roleIn(me, t.id) : null
  const mine = me ? reviews.find(r => r.userId === me.id) : undefined
  res.json({
    ...summarize(reviews.map(r => r.score)),
    organizer: summarize(ownerScores),
    items: reviews.filter(r => r.comment).map(r => ({
      id: r.id, role: r.role, score: r.score, comment: r.comment, createdAt: r.createdAt.toISOString(),
      author: { id: r.user.id, name: r.user.name, avatarUrl: r.user.avatarUrl ?? undefined },
      ...(r.reply && { reply: { text: r.reply, by: r.replyBy ?? '', at: r.repliedAt!.toISOString() } }),
    })),
    canReview: !!myRole,
    canReply: await isOrganizerOf(me, t.id),
    ...(mine && { mine: { score: mine.score, comment: mine.comment ?? undefined } }),
  })
})

reviewsRouter.post('/tournaments/:id/review', requireAuth(), async (req, res) => {
  const d = body(req, z.object({ score: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() }))
  const t = await prisma.tournament.findUnique({ where: { id: param(req, 'id') } })
  if (!t) throw notFound('tournament_not_found')
  if (t.status !== 'finished') throw badRequest('tournament_not_finished')
  const role = await roleIn(req.user!, t.id)
  if (!role) throw forbidden('not_a_participant')
  const data = { score: d.score, comment: d.comment || null, role }
  await prisma.tournamentReview.upsert({
    where: { tournamentId_userId: { tournamentId: t.id, userId: req.user!.id } },
    create: { tournamentId: t.id, userId: req.user!.id, ...data },
    update: data,
  })
  res.status(201).json({ ok: true })
})

// the organizers answer a review publicly (an empty text removes the answer); the author learns about it
reviewsRouter.post('/reviews/:id/reply', requireAuth(), async (req, res) => {
  const { text } = body(req, z.object({ text: z.string().trim().max(1000) }))
  const review = await prisma.tournamentReview.findUnique({ where: { id: param(req, 'id') }, include: { tournament: { select: { id: true, name: true } } } })
  if (!review) throw notFound('review_not_found')
  if (!(await isOrganizerOf(req.user, review.tournamentId))) throw forbidden('organizers_only')
  await prisma.tournamentReview.update({
    where: { id: review.id },
    data: text ? { reply: text, replyBy: req.user!.name, repliedAt: new Date() } : { reply: null, replyBy: null, repliedAt: null },
  })
  if (text) background(notify([review.userId], 'participant.reviewReply', { tournament: review.tournament.name }, `/tournaments/${review.tournamentId}?tab=reviews`))
  res.json({ ok: true })
})
