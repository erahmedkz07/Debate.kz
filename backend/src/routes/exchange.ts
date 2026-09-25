import { Router } from 'express'
import { z } from 'zod'
import type { JudgeLevel, User } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { toDay } from '../lib/dates.js'
import { badRequest, conflict, forbidden, HttpError, notFound } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { sendMail } from '../lib/mail.js'
import { env } from '../lib/env.js'
import { assertCanManage, participationIn, publicWhere, summaryInclude, toSummary } from '../services/tournaments.js'
import { judgeProfile, judgeProfiles, levelRank } from '../services/judgeLevels.js'

// Judge exchange ("InDrive" for judges): organizers post how many judges they need and the minimum level,
// people apply, organizers pick. Accepting creates the Judge row, exactly like an invite link would.
export const exchangeRouter = Router()

const DAILY_APPLICATION_LIMIT = 20
// the organizer's 1..10 rating of a new judge starts from their earned level
const ratingByLevel: Record<JudgeLevel, number> = { novice: 5, judge: 6, experienced: 8, chief: 9 }
const levelSchema = z.enum(['novice', 'judge', 'experienced', 'chief'])

// a call is visible and open for applications only while the tournament is public and not finished
const liveCall = { open: true, tournament: { ...publicWhere, status: { not: 'finished' as const } } }

// ---------- public list ----------

exchangeRouter.get('/judge-calls', async (req, res) => {
  const calls = await prisma.judgeCall.findMany({
    where: liveCall,
    include: {
      tournament: { include: summaryInclude },
      _count: { select: { applications: { where: { status: 'accepted' } } } },
      ...(req.user && { applications: { where: { userId: req.user.id }, select: { status: true } } }),
    },
    orderBy: { tournament: { startDate: 'asc' } },
  })
  res.json(calls.map(c => ({
    tournament: toSummary(c.tournament),
    needed: c.needed,
    accepted: c._count.applications,
    minLevel: c.minLevel,
    message: c.message ?? undefined,
    myStatus: 'applications' in c ? (c.applications as { status: string }[])[0]?.status : undefined,
  })))
})

// ---------- applicants ----------

exchangeRouter.post('/judge-calls/:tournamentId/applications', requireAuth(), requireVerified, async (req, res) => {
  const d = body(req, z.object({ message: z.string().trim().max(500).optional() }))
  const me = req.user!
  const call = await prisma.judgeCall.findFirst({ where: { tournamentId: param(req, 'tournamentId'), ...liveCall } })
  if (!call) throw notFound('call_not_found')
  // the same rules as invites: no judging a tournament where you compete or already have rights
  const role = await participationIn(me.id, call.tournamentId)
  if (role.competitor) throw forbidden('conflict_of_interest')
  if (role.judge || role.organizer) throw conflict('already_joined')
  const profile = await judgeProfile(me.id)
  if (levelRank(profile.level) < levelRank(call.minLevel)) throw forbidden('level_too_low')
  const today = await prisma.judgeApplication.count({ where: { userId: me.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
  if (today >= DAILY_APPLICATION_LIMIT) throw new HttpError(429, 'too_many_applications')
  const existing = await prisma.judgeApplication.findUnique({ where: { tournamentId_userId: { tournamentId: call.tournamentId, userId: me.id } } })
  // a withdrawn application may be sent again; pending, accepted or declined ones may not
  if (existing && existing.status !== 'withdrawn') throw conflict('already_applied')
  const data = { status: 'pending' as const, message: d.message || null, decidedAt: null }
  if (existing) await prisma.judgeApplication.update({ where: { id: existing.id }, data })
  else await prisma.judgeApplication.create({ data: { ...data, tournamentId: call.tournamentId, userId: me.id } })
  res.status(201).json({ ok: true })
})

exchangeRouter.delete('/judge-calls/:tournamentId/applications/me', requireAuth(), async (req, res) => {
  const app = await prisma.judgeApplication.findUnique({ where: { tournamentId_userId: { tournamentId: param(req, 'tournamentId'), userId: req.user!.id } } })
  if (!app) throw notFound('application_not_found')
  if (app.status !== 'pending') throw badRequest('cannot_withdraw')
  await prisma.judgeApplication.update({ where: { id: app.id }, data: { status: 'withdrawn' } })
  res.status(204).end()
})

exchangeRouter.get('/me/judge-applications', requireAuth(), async (req, res) => {
  const apps = await prisma.judgeApplication.findMany({
    where: { userId: req.user!.id, status: { not: 'withdrawn' } },
    include: { call: { include: { tournament: { include: summaryInclude } } } },
    orderBy: { createdAt: 'desc' },
  })
  res.json(apps.map(a => ({ id: a.id, status: a.status, createdAt: toDay(a.createdAt), tournament: toSummary(a.call.tournament) })))
})

// ---------- organizers ----------

exchangeRouter.get('/tournaments/:id/judge-call', requireAuth(), async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  const call = await prisma.judgeCall.findUnique({
    where: { tournamentId: param(req, 'id') },
    include: { applications: { where: { status: { not: 'withdrawn' } }, include: { user: true }, orderBy: { createdAt: 'asc' } } },
  })
  if (!call) return void res.json(null)
  const profiles = await judgeProfiles(call.applications.map(a => a.userId))
  const order = { pending: 0, accepted: 1, declined: 2, withdrawn: 3 }
  res.json({
    needed: call.needed, minLevel: call.minLevel, message: call.message ?? undefined, open: call.open,
    accepted: call.applications.filter(a => a.status === 'accepted').length,
    applications: call.applications
      .map(a => {
        const p = profiles.get(a.userId)!
        return {
          id: a.id, status: a.status, message: a.message ?? undefined, createdAt: toDay(a.createdAt),
          user: { id: a.user.id, name: a.user.name, institution: a.user.institution ?? undefined, city: a.user.city ?? undefined, avatarUrl: a.user.avatarUrl ?? undefined },
          level: p.level,
          stats: { debates: p.stats.debates, tournaments: p.stats.tournaments, feedbackAvg: p.stats.feedbackAvg, agreement: p.stats.agreement },
        }
      })
      // pending first, then by level so the strongest candidates are on top
      .sort((a, b) => order[a.status] - order[b.status] || levelRank(b.level) - levelRank(a.level)),
  })
})

exchangeRouter.put('/tournaments/:id/judge-call', requireAuth(), async (req, res) => {
  await assertCanManage(req.user, param(req, 'id'))
  const d = body(req, z.object({
    needed: z.number().int().min(1).max(64),
    minLevel: levelSchema.default('novice'),
    message: z.string().trim().max(500).optional(),
    open: z.boolean().default(true),
  }))
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: param(req, 'id') } })
  // the exchange is public, so only approved, visible tournaments may post there
  if (d.open && (t.moderation !== 'approved' || t.reportHold)) throw forbidden('not_approved')
  if (d.open && t.status === 'finished') throw forbidden('tournament_finished')
  const data = { needed: d.needed, minLevel: d.minLevel, message: d.message || null, open: d.open }
  await prisma.judgeCall.upsert({ where: { tournamentId: t.id }, update: data, create: { ...data, tournamentId: t.id } })
  res.json({ ok: true })
})

async function institutionIdFor(user: User, level: 'school' | 'university') {
  if (!user.institution) return undefined
  const i = await prisma.institution.upsert({ where: { name: user.institution }, update: {}, create: { name: user.institution, level } })
  return i.id
}

exchangeRouter.patch('/judge-applications/:id', requireAuth(), async (req, res) => {
  const { decision } = body(req, z.object({ decision: z.enum(['accept', 'decline']) }))
  const app = await prisma.judgeApplication.findUnique({ where: { id: param(req, 'id') }, include: { user: true, call: { include: { tournament: true } } } })
  if (!app) throw notFound('application_not_found')
  await assertCanManage(req.user, app.tournamentId)
  if (app.status !== 'pending') throw badRequest('already_processed')
  const t = app.call.tournament
  if (decision === 'accept') {
    // things may have changed since the application (e.g. they registered a team meanwhile)
    const role = await participationIn(app.userId, t.id)
    if (role.competitor) throw forbidden('conflict_of_interest')
    if (role.judge || role.organizer) throw conflict('already_joined')
    const profile = await judgeProfile(app.userId)
    const accepted = await prisma.$transaction(async tx => {
      await tx.judge.create({
        data: { tournamentId: t.id, name: app.user.name, rating: ratingByLevel[profile.level], userId: app.userId, institutionId: await institutionIdFor(app.user, t.level) },
      })
      await tx.judgeApplication.update({ where: { id: app.id }, data: { status: 'accepted', decidedAt: new Date() } })
      return tx.judgeApplication.count({ where: { tournamentId: t.id, status: 'accepted' } })
    })
    // the call closes itself once enough judges were accepted
    if (accepted >= app.call.needed) await prisma.judgeCall.update({ where: { tournamentId: t.id }, data: { open: false } })
  } else {
    await prisma.judgeApplication.update({ where: { id: app.id }, data: { status: 'declined', decidedAt: new Date() } })
  }
  await sendMail({
    to: app.user.email,
    subject: decision === 'accept' ? `Вы судья турнира «${t.name}»` : `Отклик на турнир «${t.name}»`,
    text: decision === 'accept'
      ? `Организатор принял ваш отклик. Назначения и бюллетени появятся в кабинете судьи:\n${env.CLIENT_ORIGIN}/judge`
      : 'Организатор уже набрал судей или выбрал других кандидатов. Спасибо за отклик — загляните на биржу за другими турнирами.',
  })
  res.json({ ok: true })
})
