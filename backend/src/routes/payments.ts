import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { randomBytes } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { badRequest, notFound } from '../lib/errors.js'
import { RECEIPTS_DIR, UPLOADS_DIR } from '../lib/uploads.js'
import { body, param } from '../middleware/validate.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { assertCanManage } from '../services/tournaments.js'
import { FREE_TEAM_LIMIT, newReference, platformSettings } from '../services/plans.js'
import { admins, background, notify, organizersOf } from '../services/notify.js'
import { paymentConfirmedLetter, paymentRejectedLetter } from '../services/letters.js'
import { logAction } from './admin.js'

// Pro payment by Kaspi QR with manual confirmation:
// organizer → sees the platform's Kaspi QR, the amount and a reference → pays in Kaspi with the reference in the comment
// → presses "I have paid" → admins are notified → an admin checks the Kaspi statement → confirms (tournament.paid) or rejects.
export const paymentsRouter = Router()

const PLATFORM_DIR = path.join(UPLOADS_DIR, 'platform')
const kaspiInfo = (s: Awaited<ReturnType<typeof platformSettings>>) => ({
  recipient: s.kaspiRecipient ?? undefined, phone: s.kaspiPhone ?? undefined, qrUrl: s.kaspiQrUrl ?? undefined, note: s.paymentNote ?? undefined,
})

// public: the pricing page shows the real limit and price
paymentsRouter.get('/plans', async (_req, res) => {
  const s = await platformSettings()
  res.json({ freeTeamLimit: FREE_TEAM_LIMIT, proPrice: s.proPrice })
})

// the creation wizard shows the payment before the tournament exists: the amount, the Kaspi details and a
// fresh reference; the wizard sends the reference with the new tournament so the transfer matches it
paymentsRouter.get('/plans/quote', requireAuth(), requireVerified, async (_req, res) => {
  const s = await platformSettings()
  let reference = newReference()
  while (await prisma.payment.findUnique({ where: { reference } })) reference = newReference()
  res.json({ amount: s.proPrice, reference, freeTeamLimit: FREE_TEAM_LIMIT, kaspi: kaspiInfo(s) })
})

// organizer: payment status of a tournament; a reference is issued on first look
paymentsRouter.get('/tournaments/:id/payment', requireAuth(), async (req, res) => {
  const id = param(req, 'id')
  await assertCanManage(req.user, id)
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id } })
  const s = await platformSettings()
  if (t.plan !== 'pro') return res.json({ required: false, paid: true, freeTeamLimit: FREE_TEAM_LIMIT })
  let p = await prisma.payment.findFirst({ where: { tournamentId: id }, orderBy: { createdAt: 'desc' } })
  if (!t.paid && !p) p = await prisma.payment.create({ data: { tournamentId: id, userId: req.user!.id, amount: s.proPrice, reference: newReference() } })
  // the price may change before the organizer pays: an unpaid reference follows the current price
  if (!t.paid && p && p.status === 'awaiting' && p.amount !== s.proPrice) p = await prisma.payment.update({ where: { id: p.id }, data: { amount: s.proPrice } })
  res.json({
    required: true, paid: t.paid, freeTeamLimit: FREE_TEAM_LIMIT,
    ...(p && { id: p.id, amount: p.amount, reference: p.reference, status: t.paid ? 'confirmed' : p.status, payerNote: p.payerNote ?? undefined, adminNote: p.adminNote ?? undefined, hasReceipt: !!p.receiptPath }),
    kaspi: kaspiInfo(s),
  })
})

// organizer: "I have paid" (again after a rejection too)
const receiptUpload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, f, cb) => cb(null, ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(f.mimetype)),
})
paymentsRouter.post('/tournaments/:id/payment/claim', requireAuth(), receiptUpload.single('receipt'), async (req, res) => {
  const id = param(req, 'id')
  await assertCanManage(req.user, id)
  const { payerNote } = body(req, z.object({ payerNote: z.string().trim().min(2).max(300) }))
  if (!req.file) throw badRequest('receipt_required')
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id } })
  if (t.plan !== 'pro' || t.paid) throw badRequest('payment_not_needed')
  const p = await prisma.payment.findFirst({ where: { tournamentId: id }, orderBy: { createdAt: 'desc' } })
  if (!p) throw badRequest('payment_not_started')
  if (p.status === 'pending') throw badRequest('payment_already_claimed')
  const receiptPath = await saveReceipt(p.id, req.file)
  if (p.receiptPath) await unlink(path.join(RECEIPTS_DIR, path.basename(p.receiptPath))).catch(() => undefined)
  await prisma.payment.update({ where: { id: p.id }, data: { status: 'pending', payerNote, paidAt: new Date(), userId: req.user!.id, adminNote: null, receiptPath } })
  const to = await admins()
  background(notify(to, 'admin.paymentClaimed', { tournament: t.name, amount: p.amount, reference: p.reference }, '/admin?tab=payments'))
  res.json({ ok: true })
})

// ---------- admin ----------

paymentsRouter.get('/admin/payments', requireAuth('admin'), async (_req, res) => {
  const rows = await prisma.payment.findMany({
    where: { status: { not: 'awaiting' } },
    include: { tournament: { select: { id: true, name: true, maxTeams: true } }, user: { select: { name: true, email: true } }, handledBy: { select: { name: true } } },
    orderBy: [{ status: 'desc' }, { paidAt: 'desc' }],
    take: 200,
  })
  // pending first
  rows.sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'))
  res.json(rows.map(p => ({
    id: p.id, amount: p.amount, reference: p.reference, status: p.status, payerNote: p.payerNote ?? undefined, adminNote: p.adminNote ?? undefined,
    paidAt: p.paidAt?.toISOString(), handledAt: p.handledAt?.toISOString(), handledBy: p.handledBy?.name, hasReceipt: !!p.receiptPath,
    tournament: p.tournament, payer: p.user ?? undefined,
  })))
})

paymentsRouter.patch('/admin/payments/:id', requireAuth('admin'), async (req, res) => {
  const d = body(req, z.object({ status: z.enum(['confirmed', 'rejected']), adminNote: z.string().trim().max(300).optional() }))
  const p = await prisma.payment.findUnique({ where: { id: param(req, 'id') }, include: { tournament: true } })
  if (!p) throw notFound('payment_not_found')
  if (p.status !== 'pending') throw badRequest('payment_not_pending')
  if (d.status === 'rejected' && !d.adminNote) throw badRequest('reason_required')
  const now = new Date()
  await prisma.$transaction([
    prisma.payment.update({ where: { id: p.id }, data: { status: d.status, adminNote: d.adminNote || null, handledById: req.user!.id, handledAt: now } }),
    ...(d.status === 'confirmed' ? [prisma.tournament.update({ where: { id: p.tournamentId }, data: { paid: true } })] : []),
  ])
  const target = { type: 'tournament' as const, id: p.tournamentId, label: p.tournament.name }
  await logAction(req.user!, d.status === 'confirmed' ? 'tournament.paid' : 'payment.reject', target, `${p.reference} · ${p.amount} ₸${d.adminNote ? ` · ${d.adminNote}` : ''}`)
  // the organizers learn the decision on the site, in Telegram and by email
  const orgs = await organizersOf(p.tournamentId)
  const link = `/dashboard/tournaments/${p.tournamentId}/settings`
  background(notify(orgs, d.status === 'confirmed' ? 'organizer.paymentConfirmed' : 'organizer.paymentRejected', { tournament: p.tournament.name, reason: d.adminNote ?? '' }, link))
  const people = await prisma.user.findMany({ where: { id: { in: orgs } } })
  for (const u of people) background(d.status === 'confirmed' ? paymentConfirmedLetter(u, p.tournament.name, p.reference) : paymentRejectedLetter(u, p.tournament.name, d.adminNote!, p.tournamentId))
  res.json({ ok: true })
})

paymentsRouter.get('/admin/settings', requireAuth('admin'), async (_req, res) => {
  const s = await platformSettings()
  res.json({ proPrice: s.proPrice, freeTeamLimit: FREE_TEAM_LIMIT, ...kaspiInfo(s) })
})

paymentsRouter.patch('/admin/settings', requireAuth('admin'), async (req, res) => {
  const d = body(req, z.object({
    proPrice: z.number().int().min(0).max(10_000_000).optional(),
    recipient: z.string().trim().max(100).optional(),
    phone: z.string().trim().max(30).optional(),
    note: z.string().trim().max(500).optional(),
  }))
  await platformSettings()
  const s = await prisma.platformSetting.update({
    where: { id: 'main' },
    data: {
      ...(d.proPrice !== undefined && { proPrice: d.proPrice }),
      ...(d.recipient !== undefined && { kaspiRecipient: d.recipient || null }),
      ...(d.phone !== undefined && { kaspiPhone: d.phone || null }),
      ...(d.note !== undefined && { paymentNote: d.note || null }),
    },
  })
  res.json({ proPrice: s.proPrice, freeTeamLimit: FREE_TEAM_LIMIT, ...kaspiInfo(s) })
})

// the Kaspi QR image: re-encoded (no metadata), kept sharp enough to scan
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: (_req, f, cb) => cb(null, ['image/png', 'image/jpeg', 'image/webp'].includes(f.mimetype)) })
paymentsRouter.post('/admin/settings/kaspi-qr', requireAuth('admin'), upload.single('qr'), async (req, res) => {
  if (!req.file) throw badRequest('invalid_image')
  let png: Buffer
  try {
    png = await sharp(req.file.buffer, { limitInputPixels: 40_000_000 }).rotate().resize(800, 800, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
  } catch {
    throw badRequest('invalid_image')
  }
  await mkdir(PLATFORM_DIR, { recursive: true })
  const file = `kaspi-qr-${randomBytes(6).toString('hex')}.png`
  await writeFile(path.join(PLATFORM_DIR, file), png)
  const old = await platformSettings()
  const s = await prisma.platformSetting.update({ where: { id: 'main' }, data: { kaspiQrUrl: `/uploads/platform/${file}` } })
  if (old.kaspiQrUrl?.startsWith('/uploads/platform/')) await unlink(path.join(PLATFORM_DIR, path.basename(old.kaspiQrUrl))).catch(() => undefined)
  res.json({ proPrice: s.proPrice, freeTeamLimit: FREE_TEAM_LIMIT, ...kaspiInfo(s) })
})

// the receipt file: a photo is re-encoded (no metadata); a PDF is kept as is, but only if it really starts like a PDF
async function saveReceipt(paymentId: string, file: Express.Multer.File) {
  await mkdir(RECEIPTS_DIR, { recursive: true })
  const name = `${paymentId}-${randomBytes(6).toString('hex')}`
  if (file.mimetype === 'application/pdf') {
    if (file.buffer.subarray(0, 5).toString() !== '%PDF-') throw badRequest('invalid_receipt')
    await writeFile(path.join(RECEIPTS_DIR, `${name}.pdf`), file.buffer)
    return `${name}.pdf`
  }
  let jpg: Buffer
  try {
    jpg = await sharp(file.buffer, { limitInputPixels: 60_000_000 }).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
  } catch {
    throw badRequest('invalid_receipt')
  }
  await writeFile(path.join(RECEIPTS_DIR, `${name}.jpg`), jpg)
  return `${name}.jpg`
}

// only admins and the organizers of that tournament can open a receipt
paymentsRouter.get('/payments/:id/receipt', requireAuth(), async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { id: param(req, 'id') } })
  if (!p?.receiptPath) throw notFound('receipt_not_found')
  if (req.user!.role !== 'admin') await assertCanManage(req.user, p.tournamentId)
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Content-Disposition', `inline; filename="receipt-${p.reference}${path.extname(p.receiptPath)}"`)
  res.sendFile(path.join(RECEIPTS_DIR, path.basename(p.receiptPath)))
})
