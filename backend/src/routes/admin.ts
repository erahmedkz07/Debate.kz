import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { badRequest, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { publicUser, requireAuth } from '../middleware/auth.js'
import { summaryInclude, toSummary } from '../services/tournaments.js'

export const adminRouter = Router()
adminRouter.use('/admin', requireAuth('admin'))

adminRouter.get('/admin/stats', async (_req, res) => {
  const [users, organizers, judges, tournaments, active, unpaid] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'organizer' } }),
    prisma.user.count({ where: { role: 'judge' } }),
    prisma.tournament.count(),
    prisma.tournament.count({ where: { status: { not: 'finished' } } }),
    prisma.tournament.count({ where: { plan: 'pro', paid: false } }),
  ])
  res.json({ users, organizers, judges, tournaments, active, unpaid })
})

adminRouter.get('/admin/tournaments', async (_req, res) => {
  const rows = await prisma.tournament.findMany({ include: summaryInclude, orderBy: { startDate: 'desc' } })
  res.json(rows.map(t => ({ ...toSummary(t), plan: t.plan, paid: t.paid, visible: t.visible })))
})

// manual payment confirmation (no online payments in MVP) and moderation
adminRouter.patch('/admin/tournaments/:id', async (req, res) => {
  const d = body(req, z.object({ paid: z.boolean().optional(), visible: z.boolean().optional() }))
  const t = await prisma.tournament.findUnique({ where: { id: param(req, 'id') } })
  if (!t) throw notFound('tournament_not_found')
  const updated = await prisma.tournament.update({ where: { id: t.id }, data: d, include: summaryInclude })
  res.json({ ...toSummary(updated), plan: updated.plan, paid: updated.paid, visible: updated.visible })
})

adminRouter.get('/admin/users', async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })
  res.json(users.map(publicUser))
})

adminRouter.patch('/admin/users/:id', async (req, res) => {
  const d = body(req, z.object({ role: z.enum(['participant', 'organizer', 'judge', 'admin']).optional(), blocked: z.boolean().optional() }))
  // an admin cannot lock themselves out
  if (param(req, 'id') === req.user!.id) throw badRequest('cannot_change_self')
  const u = await prisma.user.findUnique({ where: { id: param(req, 'id') } })
  if (!u) throw notFound('user_not_found')
  res.json(publicUser(await prisma.user.update({ where: { id: u.id }, data: d })))
})
