import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { conflict, HttpError, unauthorized } from '../lib/errors.js'
import { body } from '../middleware/validate.js'
import { clearSession, publicUser, requireAuth, setSession } from '../middleware/auth.js'

export const authRouter = Router()

// brute-force protection for credential endpoints
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'too_many_requests' } })

const phone = z.string().trim().regex(/^\+?7\s?\(?7\d{2}\)?\s?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/, 'phone')

const registerSchema = z.object({
  name: z.string().trim().min(3).max(100).refine(v => v.includes(' '), 'full name required'),
  email: z.string().trim().toLowerCase().email().max(200),
  phone,
  password: z.string().min(8).max(128),
  // admin cannot be self-assigned
  role: z.enum(['participant', 'organizer', 'judge']),
})

authRouter.post('/register', limiter, async (req, res) => {
  const data = body(req, registerSchema)
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw conflict('exists')
  const user = await prisma.user.create({
    data: { name: data.name, email: data.email, phone: data.phone, role: data.role, passwordHash: await bcrypt.hash(data.password, 12) },
  })
  setSession(res, user.id)
  res.status(201).json({ user: publicUser(user) })
})

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) })

authRouter.post('/login', limiter, async (req, res) => {
  const { email, password } = body(req, loginSchema)
  const user = await prisma.user.findUnique({ where: { email } })
  // same error for unknown email and wrong password (no user enumeration)
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw unauthorized('invalid')
  if (user.blocked) throw new HttpError(403, 'blocked')
  setSession(res, user.id)
  res.json({ user: publicUser(user) })
})

authRouter.post('/logout', (_req, res) => {
  clearSession(res)
  res.status(204).end()
})

authRouter.get('/me', requireAuth(), (req, res) => {
  res.json({ user: publicUser(req.user!) })
})
