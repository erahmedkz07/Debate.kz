import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { Role, User } from '../generated/prisma/client.js'
import { env, isProd } from '../lib/env.js'
import { forbidden, unauthorized } from '../lib/errors.js'
import { prisma } from '../lib/prisma.js'

export const COOKIE = 'dkz_token'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User
    }
  }
}

// Session token lives in an httpOnly cookie: JS on the page cannot read it (XSS-safe)
export function setSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256' })
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: MAX_AGE_MS, path: '/' })
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/' })
}

// Attaches req.user when a valid cookie is present; never fails the request
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE]
  if (!token) return next()
  try {
    const { sub } = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as { sub: string }
    // re-read from DB so role changes and blocks apply immediately
    const user = await prisma.user.findUnique({ where: { id: sub } })
    if (user && !user.blocked) req.user = user
  } catch {
    // expired or tampered token -> treat as guest
  }
  next()
}

// Route guard: requireAuth() for any signed-in user, requireAuth('admin') for roles
export const requireAuth = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized())
  if (roles.length && !roles.includes(req.user.role)) return next(forbidden())
  next()
}

// Public shape of a user (never leak passwordHash)
export const publicUser = (u: User) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone ?? undefined, role: u.role,
  institution: u.institution ?? undefined, city: u.city ?? undefined,
  createdAt: u.createdAt.toISOString().slice(0, 10), blocked: u.blocked,
})
