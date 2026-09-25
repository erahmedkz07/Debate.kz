import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '../generated/prisma/client.js'
import type { User } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { badRequest, conflict, forbidden, HttpError, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { sendMail } from '../lib/mail.js'
import { env } from '../lib/env.js'
import { isOrganizerOf, publicWhere, summaryInclude, toSummary } from '../services/tournaments.js'

export const reportsRouter = Router()

// Reports protect auto-published tournaments: after enough reports from different, reliable,
// verified users the tournament is hidden until an admin decides.
const HOLD_THRESHOLD = 3
const HOLD_THRESHOLD_VERIFIED = 5 // a verified organization needs more reports to be hidden
const UNRELIABLE_AFTER = 2 // reporters with this many dismissed reports no longer count toward hiding
const DAILY_REPORT_LIMIT = 10

// automatic decisions are logged as "system" (no admin account)
const logSystem = (action: string, t: { id: string; name: string }, note?: string) =>
  prisma.adminAction.create({ data: { adminName: 'system', action, targetType: 'tournament', targetId: t.id, targetLabel: t.name, note: note ?? null } })
const logAdmin = (admin: User, action: string, t: { id: string; name: string }, note?: string | null) =>
  prisma.adminAction.create({ data: { adminId: admin.id, adminName: admin.name, action, targetType: 'tournament', targetId: t.id, targetLabel: t.name, note: note ?? null } })

async function ownerOf(tournamentId: string) {
  const link = await prisma.tournamentOrganizer.findFirst({ where: { tournamentId, role: 'owner' }, include: { user: true } })
  return link?.user
}

reportsRouter.post('/tournaments/:id/reports', requireAuth(), requireVerified, async (req, res) => {
  const d = body(req, z.object({ reason: z.enum(['fake', 'inappropriate', 'spam', 'other']), text: z.string().trim().max(1000).optional() }))
  if (d.reason === 'other' && !d.text) throw badRequest('reason_required')
  const t = await prisma.tournament.findFirst({ where: { id: param(req, 'id'), ...publicWhere } })
  if (!t) throw notFound('tournament_not_found')
  if (await isOrganizerOf(req.user, t.id) && req.user!.role !== 'admin') throw forbidden('cannot_report_own')
  const today = await prisma.tournamentReport.count({ where: { reporterId: req.user!.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
  if (today >= DAILY_REPORT_LIMIT) throw new HttpError(429, 'too_many_reports')
  try {
    await prisma.tournamentReport.create({ data: { tournamentId: t.id, reporterId: req.user!.id, reason: d.reason, text: d.text || null } })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('already_reported')
    throw e
  }

  // count only reliable reporters (people whose earlier reports were not repeatedly dismissed)
  const open = await prisma.tournamentReport.findMany({ where: { tournamentId: t.id, status: 'open' }, select: { reporterId: true } })
  const reporterIds = open.flatMap(r => (r.reporterId ? [r.reporterId] : []))
  const dismissed = await prisma.tournamentReport.groupBy({ by: ['reporterId'], where: { reporterId: { in: reporterIds }, status: 'dismissed' }, _count: true })
  const unreliable = new Set(dismissed.filter(x => x._count >= UNRELIABLE_AFTER).map(x => x.reporterId))
  const weight = new Set(reporterIds.filter(id => !unreliable.has(id))).size
  const owner = await ownerOf(t.id)
  const threshold = owner?.organizerTrust === 'verified' ? HOLD_THRESHOLD_VERIFIED : HOLD_THRESHOLD
  if (weight >= threshold && !t.reportHold) {
    await prisma.tournament.update({ where: { id: t.id }, data: { reportHold: true } })
    await logSystem('tournament.autoHidden', t, String(weight))
    if (owner) {
      await sendMail({
        to: owner.email,
        subject: `Турнир «${t.name}» временно скрыт`,
        text: `На турнир поступило несколько жалоб, поэтому он временно скрыт из общего списка. Администратор проверит его в ближайшее время.\nУправлять турниром вы можете как обычно: ${env.CLIENT_ORIGIN}/dashboard/tournaments/${t.id}`,
      })
    }
  }
  res.status(201).json({ ok: true })
})

// ---------- admin ----------

reportsRouter.get('/admin/reports', requireAuth('admin'), async (_req, res) => {
  const rows = await prisma.tournament.findMany({
    where: { reports: { some: { status: 'open' } } },
    include: {
      ...summaryInclude,
      reports: { where: { status: 'open' }, include: { reporter: { select: { name: true, email: true } } }, orderBy: { createdAt: 'asc' } },
      organizers: { where: { role: 'owner' }, include: { user: { select: { name: true, email: true } } } },
    },
    orderBy: [{ reportHold: 'desc' }, { updatedAt: 'desc' }],
  })
  res.json(rows.map(t => ({
    tournament: { ...toSummary(t), reportHold: t.reportHold, autoApproved: t.autoApproved, owner: t.organizers[0]?.user },
    reports: t.reports.map(r => ({ id: r.id, reason: r.reason, text: r.text ?? undefined, createdAt: r.createdAt.toISOString(), reporter: r.reporter ?? undefined })),
  })))
})

// dismiss: the tournament is fine (reporters lose weight); uphold: the tournament is rejected (the owner loses trust)
reportsRouter.patch('/admin/reports/:tournamentId', requireAuth('admin'), async (req, res) => {
  const d = body(req, z.object({ decision: z.enum(['dismiss', 'uphold']), note: z.string().trim().max(500).optional() }))
  if (d.decision === 'uphold' && !d.note) throw badRequest('reason_required')
  const t = await prisma.tournament.findUnique({ where: { id: param(req, 'tournamentId') } })
  if (!t) throw notFound('tournament_not_found')
  const open = await prisma.tournamentReport.count({ where: { tournamentId: t.id, status: 'open' } })
  if (!open) throw badRequest('no_open_reports')
  const resolved = { resolvedById: req.user!.id, resolvedAt: new Date() }
  await prisma.$transaction([
    prisma.tournamentReport.updateMany({ where: { tournamentId: t.id, status: 'open' }, data: { status: d.decision === 'uphold' ? 'upheld' : 'dismissed', ...resolved } }),
    prisma.tournament.update({
      where: { id: t.id },
      data: d.decision === 'uphold' ? { reportHold: false, moderation: 'rejected', moderationNote: d.note } : { reportHold: false },
    }),
  ])
  await logAdmin(req.user!, d.decision === 'uphold' ? 'tournament.reportsUpheld' : 'tournament.reportsDismissed', t, d.note)
  const owner = await ownerOf(t.id)
  if (owner) {
    await sendMail({
      to: owner.email,
      subject: d.decision === 'uphold' ? `Турнир «${t.name}» снят с публикации` : `Турнир «${t.name}» снова опубликован`,
      text: d.decision === 'uphold'
        ? `Администратор проверил жалобы и снял турнир с публикации. Причина: ${d.note}`
        : `Администратор проверил жалобы: нарушений нет, турнир снова виден всем.\n${env.CLIENT_ORIGIN}/tournaments/${t.id}`,
    })
  }
  res.json({ ok: true })
})
