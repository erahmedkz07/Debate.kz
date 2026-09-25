import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { badRequest, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { publicUser, requireAuth } from '../middleware/auth.js'
import { sendMail } from '../lib/mail.js'
import { env } from '../lib/env.js'
import { summaryInclude, toSummary } from '../services/tournaments.js'
import { judgeProfiles } from '../services/judgeLevels.js'
import { trustLevels } from '../services/organizerTrust.js'
import type { User } from '../generated/prisma/client.js'

export const adminRouter = Router()
adminRouter.use('/admin', requireAuth('admin'))

// every admin decision is written to the audit log
function logAction(admin: User, action: string, target: { type: 'tournament' | 'user'; id: string; label: string }, note?: string | null) {
  return prisma.adminAction.create({
    data: { adminId: admin.id, adminName: admin.name, action, targetType: target.type, targetId: target.id, targetLabel: target.label, note: note ?? null },
  })
}

adminRouter.get('/admin/actions', async (_req, res) => {
  const rows = await prisma.adminAction.findMany({ orderBy: { createdAt: 'desc' }, take: 300 })
  res.json(rows.map(a => ({
    id: a.id, adminName: a.adminName, action: a.action, targetType: a.targetType, targetId: a.targetId,
    targetLabel: a.targetLabel, note: a.note ?? undefined, createdAt: a.createdAt.toISOString(),
  })))
})

adminRouter.get('/admin/stats', async (_req, res) => {
  const [users, organizers, judges, tournaments, active, unpaid, pendingModeration, openReports] = await Promise.all([
    prisma.user.count(),
    // people who organize / judge at least one tournament (no longer global roles)
    prisma.user.count({ where: { organizedTournaments: { some: {} } } }),
    prisma.user.count({ where: { judgeProfiles: { some: {} } } }),
    prisma.tournament.count(),
    prisma.tournament.count({ where: { status: { not: 'finished' } } }),
    prisma.tournament.count({ where: { plan: 'pro', paid: false } }),
    prisma.tournament.count({ where: { moderation: 'pending' } }),
    prisma.tournament.count({ where: { reports: { some: { status: 'open' } } } }),
  ])
  res.json({ users, organizers, judges, tournaments, active, unpaid, pendingModeration, openReports })
})

adminRouter.get('/admin/tournaments', async (_req, res) => {
  const rows = await prisma.tournament.findMany({
    include: {
      ...summaryInclude,
      organizers: { where: { role: 'owner' }, include: { user: { select: { name: true, email: true } } } },
      _count: { select: { teams: true, reports: { where: { status: 'open' } } } },
    },
    orderBy: [{ moderation: 'asc' }, { createdAt: 'desc' }], // pending first
  })
  res.json(rows.map(t => ({
    ...toSummary(t), plan: t.plan, paid: t.paid, visible: t.visible, moderation: t.moderation,
    moderationNote: t.moderationNote ?? undefined, owner: t.organizers[0]?.user,
    autoApproved: t.autoApproved, reportHold: t.reportHold, openReports: t._count.reports,
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
  const target = { type: 'tournament' as const, id: t.id, label: t.name }
  if (d.moderation) await logAction(req.user!, `tournament.${d.moderation === 'approved' ? 'approve' : 'reject'}`, target, d.moderationNote)
  if (d.paid !== undefined && d.paid !== t.paid) await logAction(req.user!, d.paid ? 'tournament.paid' : 'tournament.unpaid', target)
  if (d.visible !== undefined && d.visible !== t.visible) await logAction(req.user!, d.visible ? 'tournament.show' : 'tournament.hide', target)
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
  const profiles = await judgeProfiles(users.map(u => u.id))
  // organizer trust only for people who own tournaments or have an override
  const owners = await prisma.tournamentOrganizer.findMany({ where: { role: 'owner' }, select: { userId: true }, distinct: ['userId'] })
  const trust = await trustLevels([...owners.map(o => o.userId), ...users.filter(u => u.organizerTrust).map(u => u.id)])
  // a level is shown only for people who have judged or were given a minimum level
  const levelOf = (id: string) => { const p = profiles.get(id); return p && (p.stats.debates > 0 || p.minLevel) ? p.level : undefined }
  res.json(users.map(u => ({
    ...publicUser(u), judgeLevel: levelOf(u.id), judgeLevelMin: u.judgeLevelMin ?? undefined,
    organizerTrust: trust.get(u.id), organizerTrustOverride: u.organizerTrust ?? undefined,
  })))
})

adminRouter.patch('/admin/users/:id', async (req, res) => {
  const d = body(req, z.object({
    role: z.enum(['user', 'admin']).optional(),
    blocked: z.boolean().optional(),
    // minimum judge level for experienced judges who are new to the platform; null = earned level only
    judgeLevelMin: z.enum(['judge', 'experienced', 'chief']).nullable().optional(),
    // verified organization (published at once) or restricted (always moderated); null = earned trust
    organizerTrust: z.enum(['verified', 'restricted']).nullable().optional(),
  }))
  // an admin cannot lock themselves out
  if (param(req, 'id') === req.user!.id) throw badRequest('cannot_change_self')
  const u = await prisma.user.findUnique({ where: { id: param(req, 'id') } })
  if (!u) throw notFound('user_not_found')
  const updated = await prisma.user.update({ where: { id: u.id }, data: d })
  const target = { type: 'user' as const, id: u.id, label: `${u.name} (${u.email})` }
  if (d.role && d.role !== u.role) await logAction(req.user!, 'user.role', target, d.role)
  if (d.blocked !== undefined && d.blocked !== u.blocked) await logAction(req.user!, d.blocked ? 'user.block' : 'user.unblock', target)
  if (d.judgeLevelMin !== undefined && d.judgeLevelMin !== u.judgeLevelMin) await logAction(req.user!, 'user.judgeLevel', target, d.judgeLevelMin ?? 'auto')
  if (d.organizerTrust !== undefined && d.organizerTrust !== u.organizerTrust) await logAction(req.user!, 'user.organizerTrust', target, d.organizerTrust ?? 'auto')
  const profile = (await judgeProfiles([u.id])).get(u.id)
  const shown = profile && (profile.stats.debates > 0 || profile.minLevel) ? profile.level : undefined
  const trust = (await trustLevels([u.id])).get(u.id)
  res.json({ ...publicUser(updated), judgeLevel: shown, judgeLevelMin: updated.judgeLevelMin ?? undefined, organizerTrust: trust, organizerTrustOverride: updated.organizerTrust ?? undefined })
})
