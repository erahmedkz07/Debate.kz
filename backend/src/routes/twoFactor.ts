import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { badRequest, conflict } from '../lib/errors.js'
import { body } from '../middleware/validate.js'
import { requireAuth, sessionUser } from '../middleware/auth.js'
import { hashRecovery, newRecoveryCodes, newSecret, otpauthUrl, verifyCode } from '../lib/totp.js'
import { acceptCode } from '../services/twoFactor.js'

// Turning two-step sign-in on and off in the profile. On: a new secret is shown as a QR code for the authenticator app;
// it starts to count only after a code from the app proves the phone has it, and then 8 recovery codes are shown once.
export const twoFactorRouter = Router()

twoFactorRouter.post('/me/2fa/setup', requireAuth(), async (req, res) => {
  const user = req.user!
  if (user.totpEnabledAt) throw conflict('two_factor_on')
  const secret = newSecret()
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret, totpLastStep: null } })
  res.json({ secret, url: otpauthUrl(secret, user.email) })
})

twoFactorRouter.post('/me/2fa/enable', requireAuth(), async (req, res) => {
  const { code } = body(req, z.object({ code: z.string().trim().min(6).max(10) }))
  const user = req.user!
  if (user.totpEnabledAt) throw conflict('two_factor_on')
  const step = user.totpSecret ? verifyCode(user.totpSecret, code) : null
  if (step === null) throw badRequest('invalid_code')
  const recovery = newRecoveryCodes()
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabledAt: new Date(), totpLastStep: step, totpRecovery: recovery.map(hashRecovery) },
  })
  res.json({ user: await sessionUser(updated), recovery })
})

// turning it off needs a code (or a recovery code) too: a stolen session alone cannot remove the protection
twoFactorRouter.post('/me/2fa/disable', requireAuth(), async (req, res) => {
  const { code } = body(req, z.object({ code: z.string().trim().min(6).max(20) }))
  const user = req.user!
  if (!user.totpEnabledAt) return void res.json({ user: await sessionUser(user) })
  if (!(await acceptCode(user, code))) throw badRequest('invalid_code')
  const updated = await prisma.user.update({ where: { id: user.id }, data: { totpEnabledAt: null, totpSecret: null, totpLastStep: null, totpRecovery: [] } })
  res.json({ user: await sessionUser(updated) })
})
