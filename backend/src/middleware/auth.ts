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
  // iatMs: issue time in milliseconds, so a password change revokes sessions from the same second too
  const token = jwt.sign({ sub: userId, iatMs: Date.now() }, env.JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256' })
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
    const { sub, iat, iatMs } = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as { sub: string; iat: number; iatMs?: number }
    // re-read from DB so role changes and blocks apply immediately
    const user = await prisma.user.findUnique({ where: { id: sub } })
    // sessions created before the last password change are no longer valid
    // (older tokens only have iat in whole seconds)
    const issued = iatMs ?? iat * 1000
    const revoked = !!user?.passwordChangedAt && issued < (iatMs ? user.passwordChangedAt.getTime() : Math.floor(user.passwordChangedAt.getTime() / 1000) * 1000)
    if (user && !user.blocked && !revoked) req.user = user
  } catch {
    // expired or tampered token -> treat as guest
  }
  next()
}

// Route guard: requireAuth() for any signed-in user, requireAuth('admin') for admins.
// Organizer / judge rights are per tournament and checked inside the routes.
export const requireAuth = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized())
  if (roles.length && !roles.includes(req.user.role)) return next(forbidden())
  next()
}

// Actions that create content or join tournaments need a confirmed email (anti-spam)
export const requireVerified = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized())
  if (!req.user.emailVerifiedAt) return next(forbidden('email_not_verified'))
  next()
}

// Public shape of a user (never leak passwordHash)
export const publicUser = (u: User) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone ?? undefined, role: u.role,
  institution: u.institution ?? undefined, city: u.city ?? undefined, avatarUrl: u.avatarUrl ?? undefined,
  createdAt: u.createdAt.toISOString().slice(0, 10), blocked: u.blocked, emailVerified: !!u.emailVerifiedAt,
  phoneVerified: !!u.phoneVerifiedAt,
  telegramLinked: !!u.telegramChatId, telegramUsername: u.telegramUsername ?? undefined, telegramNotify: u.telegramNotify,
})

// Current user + what they do on the platform, so the UI can show only relevant cabinet sections
export async function sessionUser(u: User) {
  const [organizes, judges] = await Promise.all([
    prisma.tournamentOrganizer.count({ where: { userId: u.id } }),
    prisma.judge.count({ where: { userId: u.id } }),
  ])
  return { ...publicUser(u), organizes: organizes > 0, judges: judges > 0 }
}
