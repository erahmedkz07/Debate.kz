import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { badRequest, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { publicUser, requireAuth } from '../middleware/auth.js'
import { sendMail } from '../lib/mail.js'
import { env } from '../lib/env.js'
import { summaryInclude, toSummary } from '../services/tournaments.js'

export const adminRouter = Router()
adminRouter.use('/admin', requireAuth('admin'))

adminRouter.get('/admin/stats', async (_req, res) => {
  const [users, organizers, judges, tournaments, active, unpaid, pendingModeration] = await Promise.all([
    prisma.user.count(),
    // people who organize / judge at least one tournament (no longer global roles)
    prisma.user.count({ where: { organizedTournaments: { some: {} } } }),
    prisma.user.count({ where: { judgeProfiles: { some: {} } } }),
    prisma.tournament.count(),
    prisma.tournament.count({ where: { status: { not: 'finished' } } }),
    prisma.tournament.count({ where: { plan: 'pro', paid: false } }),
    prisma.tournament.count({ where: { moderation: 'pending' } }),
  ])
  res.json({ users, organizers, judges, tournaments, active, unpaid, pendingModeration })
})

adminRouter.get('/admin/tournaments', async (_req, res) => {
  const rows = await prisma.tournament.findMany({
    include: { ...summaryInclude, organizers: { where: { role: 'owner' }, include: { user: { select: { name: true, email: true } } } } },
    orderBy: [{ moderation: 'asc' }, { createdAt: 'desc' }], // pending first
  })
  res.json(rows.map(t => ({
    ...toSummary(t), plan: t.plan, paid: t.paid, visible: t.visible, moderation: t.moderation,
    moderationNote: t.moderationNote ?? undefined, owner: t.organizers[0]?.user,
  })))
})

// manual payment confirmation (no online payments in MVP) and moderation
adminRouter.patch('/admin/tournaments/:id', async (req, res) => {
  const d = body(req, z.object({
    paid: z.boolean().optional(),
    visible: z.boolean().optional(),
    moderation: z.enum(['approved', 'rejected']).optional(),
    moderationNote: z.string().trim().max(500).optional(),
  }))
  if (d.moderation === 'rejected' && !d.moderationNote) throw badRequest('reason_required')
  const t = await prisma.tournament.findUnique({
    where: { id: param(req, 'id') },
    include: { organizers: { where: { role: 'owner' }, include: { user: true } } },
  })
  if (!t) throw notFound('tournament_not_found')
  const updated = await prisma.tournament.update({
    where: { id: t.id },
    data: { ...d, ...(d.moderation === 'approved' && { moderationNote: null }) },
    include: summaryInclude,
  })
  // tell the owner about the moderation decision
  const owner = t.organizers[0]?.user
  if (d.moderation && owner) {
    const approved = d.moderation === 'approved'
    await sendMail({
      to: owner.email,
      subject: approved ? `Турнир «${t.name}» одобрен` : `Турнир «${t.name}» отклонён`,
      text: approved
        ? `Ваш турнир опубликован и виден всем на Debate.kz:\n${env.CLIENT_ORIGIN}/tournaments/${t.id}`
        : `Администратор отклонил турнир. Причина: ${d.moderationNote}`,
    })
  }
  res.json({
    ...toSummary(updated), plan: updated.plan, paid: updated.paid, visible: updated.visible,
    moderation: updated.moderation, moderationNote: updated.moderationNote ?? undefined,
  })
})

adminRouter.get('/admin/users', async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })
  res.json(users.map(publicUser))
})

adminRouter.patch('/admin/users/:id', async (req, res) => {
  const d = body(req, z.object({ role: z.enum(['user', 'admin']).optional(), blocked: z.boolean().optional() }))
  // an admin cannot lock themselves out
  if (param(req, 'id') === req.user!.id) throw badRequest('cannot_change_self')
  const u = await prisma.user.findUnique({ where: { id: param(req, 'id') } })
  if (!u) throw notFound('user_not_found')
  res.json(publicUser(await prisma.user.update({ where: { id: u.id }, data: d })))
})
