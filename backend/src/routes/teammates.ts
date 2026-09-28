import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { toDay } from '../lib/dates.js'
import { badRequest, conflict, forbidden, HttpError, notFound } from '../lib/errors.js'
import { body, param, query } from '../middleware/validate.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { background, notify } from '../services/notify.js'

// "Find a teammate" board. Posts show only the author's name, institution and city — never contacts.
// A reply is delivered to the author as a notification; people exchange contacts there if they want.
export const teammatesRouter = Router()

const ACTIVE_LIMIT = 3
const LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
const DAILY_REPLIES = 20
const kind = z.enum(['team_needed', 'speaker_needed'])
const active = () => ({ closed: false, expiresAt: { gt: new Date() } })

teammatesRouter.get('/teammates', async (req, res) => {
  const q = query(req, z.object({ kind: kind.optional(), city: z.string().trim().max(60).optional(), level: z.enum(['school', 'university']).optional() }))
  const posts = await prisma.teammatePost.findMany({
    where: { ...active(), ...(q.kind && { kind: q.kind }), ...(q.city && { city: q.city }), ...(q.level && { level: q.level }), user: { blocked: false } },
    include: { user: { select: { name: true, institution: true } }, _count: { select: { replies: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const me = req.user?.id
  const mine = me ? new Set((await prisma.teammateReply.findMany({ where: { userId: me, postId: { in: posts.map(p => p.id) } }, select: { postId: true } })).map(r => r.postId)) : new Set()
  res.json(posts.map(p => ({
    id: p.id, kind: p.kind, city: p.city, level: p.level, languages: p.languages, text: p.text, createdAt: toDay(p.createdAt), expiresAt: toDay(p.expiresAt),
    author: { name: p.user.name, institution: p.user.institution ?? undefined }, replies: p._count.replies,
    own: p.userId === me, replied: mine.has(p.id),
  })))
})

teammatesRouter.post('/teammates', requireAuth(), requireVerified, async (req, res) => {
  const d = body(req, z.object({
    kind, city: z.string().trim().min(2).max(60), level: z.enum(['school', 'university']),
    languages: z.array(z.enum(['ru', 'kz', 'en'])).min(1).max(3), text: z.string().trim().min(10).max(500),
  }))
  const count = await prisma.teammatePost.count({ where: { userId: req.user!.id, ...active() } })
  if (count >= ACTIVE_LIMIT) throw badRequest('too_many_posts')
  const p = await prisma.teammatePost.create({ data: { ...d, userId: req.user!.id, expiresAt: new Date(Date.now() + LIFETIME_MS) } })
  res.status(201).json({ id: p.id })
})

// the author closes a post (found someone); admins can remove any post
teammatesRouter.delete('/teammates/:id', requireAuth(), async (req, res) => {
  const p = await prisma.teammatePost.findUnique({ where: { id: param(req, 'id') } })
  if (!p) throw notFound('post_not_found')
  if (p.userId !== req.user!.id && req.user!.role !== 'admin') throw forbidden()
  await prisma.teammatePost.update({ where: { id: p.id }, data: { closed: true } })
  res.status(204).end()
})

teammatesRouter.post('/teammates/:id/reply', requireAuth(), requireVerified, async (req, res) => {
  const { message } = body(req, z.object({ message: z.string().trim().min(5).max(300) }))
  const me = req.user!
  const p = await prisma.teammatePost.findFirst({ where: { id: param(req, 'id'), ...active() } })
  if (!p) throw notFound('post_not_found')
  if (p.userId === me.id) throw badRequest('own_post')
  const today = await prisma.teammateReply.count({ where: { userId: me.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
  if (today >= DAILY_REPLIES) throw new HttpError(429, 'too_many_replies')
  if (await prisma.teammateReply.findUnique({ where: { postId_userId: { postId: p.id, userId: me.id } } })) throw conflict('already_replied')
  await prisma.teammateReply.create({ data: { postId: p.id, userId: me.id, message } })
  background(notify([p.userId], 'participant.teammateReply', { name: me.name, institution: me.institution ?? '', city: me.city ?? '', message, kind: p.kind }, '/teammates'))
  res.status(201).json({ ok: true })
})
