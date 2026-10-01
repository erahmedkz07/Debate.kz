import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { badRequest, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { publicUser, requireAuth } from '../middleware/auth.js'
import { sendMail } from '../lib/mail.js'
import { env } from '../lib/env.js'
import { summaryInclude, toSummary } from '../services/tournaments.js'
import { background, notify, notifyModeration } from '../services/notify.js'
import type { User } from '../generated/prisma/client.js'
import { runWatchdog } from '../services/watchdog.js'

export const adminRouter = Router()
adminRouter.use('/admin', requireAuth('admin'))

// every admin decision is written to the audit log
export function logAction(admin: User, action: string, target: { type: 'tournament' | 'user' | 'news' | 'club'; id: string; label: string }, note?: string | null) {
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
  const [users, organizers, judges, tournaments, active, unpaid, pendingModeration, pendingClubs, clubReports] = await Promise.all([
    prisma.user.count(),
    // people who organize / judge at least one tournament (no longer global roles)
    prisma.user.count({ where: { organizedTournaments: { some: {} } } }),
    prisma.user.count({ where: { judgeProfiles: { some: {} } } }),
    prisma.tournament.count(),
    prisma.tournament.count({ where: { status: { not: 'finished' } } }),
    prisma.tournament.count({ where: { plan: 'pro', paid: false } }),
    prisma.tournament.count({ where: { moderation: 'pending' } }),
    prisma.club.count({ where: { status: 'pending' } }),
    prisma.clubReport.count({ where: { resolvedAt: null } }),
  ])
  res.json({ users, organizers, judges, tournaments, active, unpaid, pendingModeration, pendingClubs, clubReports })
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
// an admin can remove any tournament (spam, duplicates, fakes); the reason goes to the owner and the audit log
adminRouter.delete('/admin/tournaments/:id', async (req, res) => {
  const { reason } = body(req, z.object({ reason: z.string().trim().min(5).max(500) }))
  const t = await prisma.tournament.findUnique({
    where: { id: param(req, 'id') },
    include: { organizers: { where: { role: 'owner' }, include: { user: true } } },
  })
  if (!t) throw notFound('tournament_not_found')
  // notify first: after deletion the owner link is gone
  const owner = t.organizers[0]?.user
  await notifyModeration(t.id, t.name, 'deleted', reason).catch(() => undefined)
  await prisma.tournament.delete({ where: { id: t.id } })
  await logAction(req.user!, 'tournament.delete', { type: 'tournament', id: t.id, label: t.name }, reason)
  if (owner) {
    await sendMail({ to: owner.email, subject: `Турнир «${t.name}» удалён`, text: `Администратор удалил турнир «${t.name}». Причина: ${reason}` })
  }
  res.status(204).end()
})

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
  if (d.moderation) {
    background(notifyModeration(t.id, t.name, d.moderation, d.moderationNote))
  }
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

// ---------- clubs: approve, reject, merge duplicates, delete; open reports ----------

const memberIds = async (clubId: string) => (await prisma.clubMember.findMany({ where: { clubId }, select: { userId: true } })).map(m => m.userId)

adminRouter.get('/admin/clubs', async (_req, res) => {
  const clubs = await prisma.club.findMany({
    include: {
      _count: { select: { members: true, teams: true, tournamentTeams: true } },
      reports: { where: { resolvedAt: null }, include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
      logs: { where: { action: 'created' }, take: 1 },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // pending first
  })
  res.json(clubs.map(c => ({
    id: c.id, name: c.name, city: c.city, institution: c.institution ?? undefined, logoUrl: c.logoUrl ?? undefined,
    status: c.status, moderationNote: c.moderationNote ?? undefined, createdAt: c.createdAt.toISOString(),
    createdBy: c.logs[0]?.userName, members: c._count.members, teams: c._count.teams, tournamentTeams: c._count.tournamentTeams,
    reports: c.reports.map(r => ({ id: r.id, reason: r.reason, by: r.user.name, createdAt: r.createdAt.toISOString() })),
  })))
})

adminRouter.patch('/admin/clubs/:id', async (req, res) => {
  const d = body(req, z.object({ status: z.enum(['approved', 'rejected']), note: z.string().trim().max(500).optional() }))
  if (d.status === 'rejected' && !d.note) throw badRequest('reason_required')
  const c = await prisma.club.findUnique({ where: { id: param(req, 'id') } })
  if (!c) throw notFound('club_not_found')
  await prisma.club.update({ where: { id: c.id }, data: { status: d.status, moderationNote: d.status === 'rejected' ? d.note : null, reviewedAt: new Date() } })
  await logAction(req.user!, `club.${d.status === 'approved' ? 'approve' : 'reject'}`, { type: 'club', id: c.id, label: c.name }, d.note)
  background(notify(await memberIds(c.id), d.status === 'approved' ? 'participant.clubApproved' : 'participant.clubRejected',
    { club: c.name, reason: d.note ?? '' }, `/clubs/${c.id}`))
  res.json({ id: c.id, status: d.status })
})

// a duplicate goes into the real club: members, teams, tournament history; the duplicate is removed
adminRouter.post('/admin/clubs/:id/merge', async (req, res) => {
  const { intoId } = body(req, z.object({ intoId: z.string() }))
  const [from, into] = await Promise.all([
    prisma.club.findUnique({ where: { id: param(req, 'id') }, include: { teams: true } }),
    prisma.club.findUnique({ where: { id: intoId }, include: { teams: true } }),
  ])
  if (!from || !into) throw notFound('club_not_found')
  if (from.id === into.id) throw badRequest('same_club')
  const taken = new Set(into.teams.map(t => t.name.toLowerCase()))
  await prisma.$transaction(async tx => {
    for (const t of from.teams) {
      // a team name the real club already has gets the duplicate's name added
      let name = t.name
      for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${t.name} (${i})`
      taken.add(name.toLowerCase())
      await tx.clubTeam.update({ where: { id: t.id }, data: { clubId: into.id, name } })
    }
    await tx.clubMember.updateMany({ where: { clubId: from.id }, data: { clubId: into.id } })
    await tx.team.updateMany({ where: { clubId: from.id }, data: { clubId: into.id } })
    await tx.clubLog.updateMany({ where: { clubId: from.id }, data: { clubId: into.id } })
    await tx.clubJoinRequest.deleteMany({ where: { clubId: from.id } })
    await tx.club.delete({ where: { id: from.id } })
  })
  await logAction(req.user!, 'club.merge', { type: 'club', id: into.id, label: into.name }, `${from.name} → ${into.name}`)
  res.json({ id: into.id })
})

adminRouter.delete('/admin/clubs/:id', async (req, res) => {
  const { reason } = body(req, z.object({ reason: z.string().trim().min(5).max(500) }))
  const c = await prisma.club.findUnique({ where: { id: param(req, 'id') } })
  if (!c) throw notFound('club_not_found')
  // notify first: after deletion the members are no longer linked to the club
  await notify(await memberIds(c.id), 'participant.clubDeleted', { club: c.name, reason }).catch(() => undefined)
  await prisma.club.delete({ where: { id: c.id } })
  await logAction(req.user!, 'club.delete', { type: 'club', id: c.id, label: c.name }, reason)
  res.status(204).end()
})

adminRouter.post('/admin/club-reports/:id/resolve', async (req, res) => {
  const r = await prisma.clubReport.findUnique({ where: { id: param(req, 'id') }, include: { club: true } })
  if (!r) throw notFound('report_not_found')
  await prisma.clubReport.update({ where: { id: r.id }, data: { resolvedAt: new Date() } })
  await logAction(req.user!, 'club.reportResolved', { type: 'club', id: r.clubId, label: r.club.name }, r.reason)
  res.json({ ok: true })
})

// ---------- organizer strikes ----------

adminRouter.get('/admin/strikes', async (_req, res) => {
  const rows = await prisma.organizerStrike.findMany({ include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 300 })
  res.json(rows.map(r => ({
    id: r.id, user: r.user, tournament: r.tournamentName, reason: r.reason, createdAt: r.createdAt.toISOString(),
    lifted: !!r.liftedAt, note: r.liftedNote ?? undefined,
  })))
})

adminRouter.post('/admin/strikes/:id/lift', async (req, res) => {
  const { note } = body(req, z.object({ note: z.string().trim().min(3).max(500) }))
  const r = await prisma.organizerStrike.findUnique({ where: { id: param(req, 'id') }, include: { user: true } })
  if (!r) throw notFound('strike_not_found')
  await prisma.organizerStrike.update({ where: { id: r.id }, data: { liftedAt: new Date(), liftedNote: note } })
  await logAction(req.user!, 'user.strikeLifted', { type: 'user', id: r.userId, label: r.user.name }, `${r.tournamentName}: ${note}`)
  res.json({ ok: true })
})

adminRouter.post('/admin/watchdog/run', async (req, res) => {
  const { today } = body(req, z.object({ today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }))
  // a pretend date only in the e2e run: in production the watchdog always uses today
  res.json(await runWatchdog(env.NODE_ENV === 'test' && today ? today : undefined))
})

adminRouter.get('/admin/users', async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })
  res.json(users.map(publicUser))
})

adminRouter.patch('/admin/users/:id', async (req, res) => {
  const d = body(req, z.object({
    role: z.enum(['user', 'admin']).optional(),
    blocked: z.boolean().optional(),
    safeguardingOfficer: z.boolean().optional(), // receives and handles behaviour reports
  }))
  // an admin cannot lock themselves out
  if (param(req, 'id') === req.user!.id) throw badRequest('cannot_change_self')
  const u = await prisma.user.findUnique({ where: { id: param(req, 'id') } })
  if (!u) throw notFound('user_not_found')
  const updated = await prisma.user.update({ where: { id: u.id }, data: d })
  const target = { type: 'user' as const, id: u.id, label: `${u.name} (${u.email})` }
  if (d.role && d.role !== u.role) await logAction(req.user!, 'user.role', target, d.role)
  if (d.blocked !== undefined && d.blocked !== u.blocked) await logAction(req.user!, d.blocked ? 'user.block' : 'user.unblock', target)
  if (d.safeguardingOfficer !== undefined && d.safeguardingOfficer !== u.safeguardingOfficer) await logAction(req.user!, d.safeguardingOfficer ? 'user.safeguardingOn' : 'user.safeguardingOff', target)
  res.json(publicUser(updated))
})
