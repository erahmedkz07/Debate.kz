import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { HttpError, notFound } from '../lib/errors.js'
import { newToken } from '../lib/tokens.js'
import { body } from '../middleware/validate.js'
import { requireAuth, sessionUser, setSession } from '../middleware/auth.js'
import rateLimit from 'express-rate-limit'
import { hashToken } from '../lib/tokens.js'
import { secondStepTicket } from '../services/twoFactor.js'
import { forbidden } from '../lib/errors.js'
import { botUsername, outbox, telegramEnabled, type TgUpdate } from '../lib/telegram.js'
import { handleUpdate } from '../services/bot.js'

export const telegramRouter = Router()

const LINK_TTL_MS = 15 * 60 * 1000

telegramRouter.get('/telegram/config', (_req, res) => {
  res.json({ enabled: telegramEnabled(), username: telegramEnabled() ? botUsername() : undefined })
})

// one-time deep link: t.me/<bot>?start=<token> (only the hash is stored, 15 minutes, single use)
telegramRouter.post('/me/telegram/link', requireAuth(), async (req, res) => {
  if (!telegramEnabled()) throw new HttpError(503, 'telegram_disabled')
  // the bot will speak the language the person uses on the site right now
  const { language } = body(req, z.object({ language: z.enum(['ru', 'kz']).optional() }))
  if (language && language !== req.user!.language) await prisma.user.update({ where: { id: req.user!.id }, data: { language } })
  const { token, hash } = newToken()
  await prisma.emailToken.create({ data: { userId: req.user!.id, purpose: 'telegram_link', tokenHash: hash, expiresAt: new Date(Date.now() + LINK_TTL_MS) } })
  res.status(201).json({ url: `https://t.me/${botUsername()}?start=${token}`, expiresInMinutes: LINK_TTL_MS / 60000 })
})

telegramRouter.patch('/me/telegram', requireAuth(), async (req, res) => {
  const { notify } = body(req, z.object({ notify: z.boolean() }))
  if (!req.user!.telegramChatId) throw notFound('telegram_not_linked')
  res.json({ user: await sessionUser(await prisma.user.update({ where: { id: req.user!.id }, data: { telegramNotify: notify } })) })
})

// the person's language (the site's switch): the bot and notifications use it
telegramRouter.put('/me/language', requireAuth(), async (req, res) => {
  const { language } = body(req, z.object({ language: z.enum(['ru', 'kz']) }))
  res.json({ user: await sessionUser(await prisma.user.update({ where: { id: req.user!.id }, data: { language } })) })
})

// unlinking keeps the verified phone: it was proven once and still prevents duplicate accounts
telegramRouter.delete('/me/telegram', requireAuth(), async (req, res) => {
  res.json({ user: await sessionUser(await prisma.user.update({ where: { id: req.user!.id }, data: { telegramChatId: null, telegramUsername: null } })) })
})

// ---------- "Sign in with Telegram" ----------
// 1) the site asks: a token for the bot link and a secret that only this browser keeps;
// 2) in the bot the person sees who they will be signed in as and confirms (or says it was not them);
// 3) the browser asks with its secret and gets the session (or the two-step code question, as after a password).
export const TELEGRAM_LOGIN_TTL_MS = 5 * 60 * 1000
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'too_many_requests' } })

telegramRouter.post('/auth/telegram/start', loginLimiter, async (req, res) => {
  if (!telegramEnabled()) throw new HttpError(503, 'telegram_disabled')
  const link = newToken(), secret = newToken()
  await prisma.telegramLogin.create({
    data: { tokenHash: link.hash, secretHash: secret.hash, userAgent: req.get('user-agent')?.slice(0, 300) ?? null, expiresAt: new Date(Date.now() + TELEGRAM_LOGIN_TTL_MS) },
  })
  res.status(201).json({ url: `https://t.me/${botUsername()}?start=login_${link.token}`, secret: secret.token, expiresInSeconds: TELEGRAM_LOGIN_TTL_MS / 1000 })
})

telegramRouter.post('/auth/telegram/poll', async (req, res) => {
  const { secret } = body(req, z.object({ secret: z.string().min(10).max(200) }))
  const row = await prisma.telegramLogin.findUnique({ where: { secretHash: hashToken(secret) }, include: { user: true } })
  if (!row || row.usedAt) throw new HttpError(410, 'login_expired')
  if (row.deniedAt) throw forbidden('login_denied')
  if (!row.approvedAt || !row.user) {
    if (row.expiresAt < new Date()) throw new HttpError(410, 'login_expired')
    return void res.json({ status: 'pending' })
  }
  // used once: a second poll with the same secret gets nothing
  const claimed = await prisma.telegramLogin.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } })
  if (claimed.count !== 1) throw new HttpError(410, 'login_expired')
  if (row.user.blocked) throw new HttpError(403, 'blocked')
  if (row.user.totpEnabledAt) return void res.json({ status: 'two_factor', ticket: secondStepTicket(row.user.id) })
  setSession(res, row.user.id)
  res.json({ status: 'ok', user: await sessionUser(row.user) })
})

// ---------- test mode only: e2e plays Telegram and reads what the bot sent ----------
if (env.NODE_ENV === 'test') {
  telegramRouter.post('/telegram/test/update', async (req, res) => {
    await handleUpdate(req.body as TgUpdate)
    res.json({ ok: true })
  })
  telegramRouter.get('/telegram/test/outbox', (req, res) => {
    const chat = typeof req.query.chat === 'string' ? req.query.chat : undefined
    res.json(outbox.filter(m => !chat || m.chat_id === chat))
  })
  telegramRouter.delete('/telegram/test/outbox', (_req, res) => {
    outbox.length = 0
    res.status(204).end()
  })
}
