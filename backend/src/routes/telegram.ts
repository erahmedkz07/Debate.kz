import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { HttpError, notFound } from '../lib/errors.js'
import { newToken } from '../lib/tokens.js'
import { body } from '../middleware/validate.js'
import { requireAuth, sessionUser } from '../middleware/auth.js'
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
  const { token, hash } = newToken()
  await prisma.emailToken.create({ data: { userId: req.user!.id, purpose: 'telegram_link', tokenHash: hash, expiresAt: new Date(Date.now() + LINK_TTL_MS) } })
  res.status(201).json({ url: `https://t.me/${botUsername()}?start=${token}`, expiresInMinutes: LINK_TTL_MS / 60000 })
})

telegramRouter.patch('/me/telegram', requireAuth(), async (req, res) => {
  const { notify } = body(req, z.object({ notify: z.boolean() }))
  if (!req.user!.telegramChatId) throw notFound('telegram_not_linked')
  res.json({ user: await sessionUser(await prisma.user.update({ where: { id: req.user!.id }, data: { telegramNotify: notify } })) })
})

// unlinking keeps the verified phone: it was proven once and still prevents duplicate accounts
telegramRouter.delete('/me/telegram', requireAuth(), async (req, res) => {
  res.json({ user: await sessionUser(await prisma.user.update({ where: { id: req.user!.id }, data: { telegramChatId: null, telegramUsername: null } })) })
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
