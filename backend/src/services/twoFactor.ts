import jwt from 'jsonwebtoken'
import type { User } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { HttpError, unauthorized } from '../lib/errors.js'
import { hashRecovery, verifyCode } from '../lib/totp.js'
import { clearFailures, isLocked, noteFailure } from './loginGuard.js'

// Two-step sign-in. After the password (or Google) the person gets a short-lived ticket instead of a session; the
// session comes only with the ticket plus the 6-digit code from their authenticator app, or one of their one-time
// recovery codes. The same code is never taken twice, and wrong codes count toward the account lock.

const TICKET_TTL = '5m'
export const secondStepTicket = (userId: string) => jwt.sign({ sub: userId, purpose: '2fa' }, env.JWT_SECRET, { expiresIn: TICKET_TTL, algorithm: 'HS256' })

// a code (or a recovery code) of this user; the recovery code is used up
export async function acceptCode(user: User, code: string): Promise<boolean> {
  if (!user.totpSecret) return false
  const step = verifyCode(user.totpSecret, code)
  if (step !== null) {
    if (user.totpLastStep !== null && step <= user.totpLastStep) return false // the same code again
    await prisma.user.update({ where: { id: user.id }, data: { totpLastStep: step } })
    return true
  }
  const hash = hashRecovery(code)
  if (user.totpRecovery.includes(hash)) {
    await prisma.user.update({ where: { id: user.id }, data: { totpRecovery: user.totpRecovery.filter(h => h !== hash) } })
    return true
  }
  return false
}

export async function takeSecondStep(ticket: string, code: string): Promise<User> {
  let sub: string
  try {
    const p = jwt.verify(ticket, env.JWT_SECRET, { algorithms: ['HS256'] }) as { sub: string; purpose?: string }
    if (p.purpose !== '2fa') throw new Error('not a ticket')
    sub = p.sub
  } catch {
    throw unauthorized('ticket_expired')
  }
  const user = await prisma.user.findUnique({ where: { id: sub } })
  if (!user?.totpEnabledAt) throw unauthorized('ticket_expired')
  if (user.blocked) throw new HttpError(403, 'blocked')
  if (isLocked(user.email)) throw new HttpError(429, 'account_locked')
  if (!(await acceptCode(user, code))) {
    noteFailure(user.email)
    throw unauthorized('invalid_code')
  }
  clearFailures(user.email)
  return user
}
