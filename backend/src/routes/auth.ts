import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import type { User } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { env, isProd } from '../lib/env.js'
import { badRequest, conflict, HttpError, unauthorized } from '../lib/errors.js'
import { sendMail } from '../lib/mail.js'
import { hashToken, newToken } from '../lib/tokens.js'
import { body } from '../middleware/validate.js'
import { clearSession, requireAuth, sessionUser, setSession } from '../middleware/auth.js'

export const authRouter = Router()

// brute-force protection for credential endpoints (relaxed in development so e2e runs don't lock you out)
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: isProd ? 30 : 500, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'too_many_requests' } })
const mailLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'too_many_requests' } })

const phone = z.string().trim().regex(/^\+?7\s?\(?7\d{2}\)?\s?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/, 'phone')
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000

// Sends a fresh verification link; older unused links stay valid until they expire.
// In development the raw token is also returned so automated tests can verify without a mailbox.
async function sendVerification(user: User) {
  const { token, hash } = newToken()
  await prisma.emailToken.create({ data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + VERIFY_TTL_MS) } })
  const link = `${env.CLIENT_ORIGIN}/verify-email?token=${token}`
  await sendMail({
    to: user.email,
    subject: 'Debate.kz — подтвердите email',
    text: `Здравствуйте, ${user.name}!\n\nПодтвердите адрес, чтобы создавать турниры и регистрировать команды:\n${link}\n\nСсылка действует 24 часа. Если вы не регистрировались на Debate.kz, просто проигнорируйте письмо.`,
  })
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test' ? token : undefined
}

// Registration never lets the client pick a role: everyone starts as a plain user.
// Any extra fields (e.g. role: "admin") are stripped by zod.
const registerSchema = z.object({
  name: z.string().trim().min(3).max(100).refine(v => v.includes(' '), 'full name required'),
  email: z.string().trim().toLowerCase().email().max(200),
  phone,
  password: z.string().min(8).max(128),
  consent: z.literal(true), // consent to personal data processing
})

authRouter.post('/register', limiter, async (req, res) => {
  const data = body(req, registerSchema)
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw conflict('exists')
  const user = await prisma.user.create({
    data: { name: data.name, email: data.email, phone: data.phone, passwordHash: await bcrypt.hash(data.password, 12), consentAt: new Date() },
  })
  const devToken = await sendVerification(user)
  setSession(res, user.id)
  res.status(201).json({ user: await sessionUser(user), ...(devToken && { devVerificationToken: devToken }) })
})

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) })

authRouter.post('/login', limiter, async (req, res) => {
  const { email, password } = body(req, loginSchema)
  const user = await prisma.user.findUnique({ where: { email } })
  // same error for unknown email and wrong password (no user enumeration)
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw unauthorized('invalid')
  if (user.blocked) throw new HttpError(403, 'blocked')
  setSession(res, user.id)
  res.json({ user: await sessionUser(user) })
})

authRouter.post('/logout', (_req, res) => {
  clearSession(res)
  res.status(204).end()
})

// guests get { user: null } (200), so a normal page load does not log an error in the browser console
authRouter.get('/me', async (req, res) => {
  res.json({ user: req.user ? await sessionUser(req.user) : null })
})

authRouter.post('/verify-email', limiter, async (req, res) => {
  const { token } = body(req, z.object({ token: z.string().min(20).max(200) }))
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } })
  if (!row || row.usedAt || row.expiresAt < new Date()) throw badRequest('invalid_or_expired_token')
  const [user] = await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: row.user.emailVerifiedAt ?? new Date() } }),
    // one click verifies; every other pending link of this user is burned too
    prisma.emailToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: new Date() } }),
  ])
  res.json({ user: await sessionUser(user) })
})

authRouter.post('/resend-verification', mailLimiter, requireAuth(), async (req, res) => {
  if (req.user!.emailVerifiedAt) throw badRequest('already_verified')
  const devToken = await sendVerification(req.user!)
  res.json({ ok: true, ...(devToken && { devVerificationToken: devToken }) })
})
