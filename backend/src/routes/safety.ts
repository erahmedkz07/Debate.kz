import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { forbidden, HttpError, notFound, unauthorized } from '../lib/errors.js'
import { body, param } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { background, notify } from '../services/notify.js'

// Behaviour reports (safeguarding): anyone signed in can report bullying, harassment and the like.
// Admins and the safeguarding officers they appoint see and handle the reports.
export const safetyRouter = Router()

const DAILY_LIMIT = 5
const CATEGORIES = ['bullying', 'harassment', 'inappropriate', 'threat', 'other'] as const

const isHandler = (req: Request) => req.user?.role === 'admin' || !!req.user?.safeguardingOfficer
function handlerOnly(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized())
  if (!isHandler(req)) return next(forbidden())
  next()
}
const handlers = async () => (await prisma.user.findMany({ where: { blocked: false, OR: [{ role: 'admin' }, { safeguardingOfficer: true }] }, select: { id: true } })).map(u => u.id)

safetyRouter.post('/safety-reports', requireAuth(), async (req, res) => {
  const d = body(req, z.object({
    category: z.enum(CATEGORIES),
    about: z.string().trim().max(200).optional(),
    place: z.string().trim().max(200).optional(),
    description: z.string().trim().min(20).max(2000),
    anonymous: z.boolean().default(false),
  }))
  const today = await prisma.safetyReport.count({ where: { reporterId: req.user!.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
  if (today >= DAILY_LIMIT) throw new HttpError(429, 'too_many_reports')
  const r = await prisma.safetyReport.create({ data: { ...d, about: d.about || null, place: d.place || null, reporterId: req.user!.id } })
  // no details in the Telegram text: the report is read on the site only
  const to = await handlers()
  background(notify(to, 'admin.safetyReport', { category: d.category }, '/safety/reports'))
  res.status(201).json({ id: r.id })
})

// the reporter can follow the status of their own reports
safetyRouter.get('/me/safety-reports', requireAuth(), async (req, res) => {
  const rows = await prisma.safetyReport.findMany({ where: { reporterId: req.user!.id }, orderBy: { createdAt: 'desc' } })
  res.json(rows.map(r => ({ id: r.id, category: r.category, status: r.status, createdAt: r.createdAt.toISOString(), resolutionNote: r.resolutionNote ?? undefined })))
})

safetyRouter.get('/safety-reports', handlerOnly, async (_req, res) => {
  const rows = await prisma.safetyReport.findMany({
    include: { reporter: { select: { name: true, email: true } }, handledBy: { select: { name: true } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  })
  res.json(rows.map(r => ({
    id: r.id, category: r.category, about: r.about ?? undefined, place: r.place ?? undefined, description: r.description,
    status: r.status, resolutionNote: r.resolutionNote ?? undefined, createdAt: r.createdAt.toISOString(),
    // an anonymous reporter stays anonymous even for the handlers
    reporter: r.anonymous ? undefined : r.reporter ?? undefined, anonymous: r.anonymous, handledBy: r.handledBy?.name,
  })))
})

safetyRouter.patch('/safety-reports/:id', handlerOnly, async (req, res) => {
  const d = body(req, z.object({ status: z.enum(['open', 'in_progress', 'resolved']), resolutionNote: z.string().trim().max(1000).optional() }))
  const r = await prisma.safetyReport.findUnique({ where: { id: param(req, 'id') } })
  if (!r) throw notFound('report_not_found')
  await prisma.safetyReport.update({ where: { id: r.id }, data: { status: d.status, resolutionNote: d.resolutionNote || r.resolutionNote, handledById: req.user!.id } })
  // the reporter learns the status (not who handled it)
  if (r.reporterId && d.status !== r.status) background(notify([r.reporterId], 'participant.safetyUpdate', { status: d.status }, '/safety'))
  res.json({ ok: true })
})
