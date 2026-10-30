import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { STORAGE_DIR } from '../lib/uploads.js'

// Errors are written down and told: every server error (500) and every crash on a visitor's page goes to
// logs/errors.log (one JSON line each, the file rotates at 5 MB) and, at most once per 10 minutes for the same
// error, to the admins who linked Telegram. Nothing secret is written: no cookies, no bodies, no tokens.

const LOG_DIR = path.join(STORAGE_DIR, 'logs')
const LOG = path.join(LOG_DIR, 'errors.log')
const MAX_BYTES = 5 * 1024 * 1024
const ALERT_EVERY_MS = 10 * 60 * 1000
const lastAlert = new Map<string, number>()

export type ErrorEntry = { source: 'server' | 'client'; message: string; stack?: string; path?: string; method?: string; ua?: string }

export async function logError(e: ErrorEntry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...e, message: e.message.slice(0, 500), stack: e.stack?.slice(0, 4000) }) + '\n'
  try {
    await mkdir(LOG_DIR, { recursive: true })
    const size = await stat(LOG).then(s => s.size, () => 0)
    if (size > MAX_BYTES) await rename(LOG, `${LOG}.1`) // one old file is kept
    await appendFile(LOG, line)
  } catch { /* the log must never break a request */ }
  if (process.env.NODE_ENV === 'test') return
  const key = `${e.source}:${e.message.slice(0, 120)}`
  const last = lastAlert.get(key) ?? 0
  if (Date.now() - last < ALERT_EVERY_MS) return
  lastAlert.set(key, Date.now())
  if (lastAlert.size > 1000) lastAlert.clear()
  void tellAdmins(`${e.source === 'server' ? 'ошибка сервера' : 'ошибка на странице'}: ${e.message.slice(0, 200)}${e.path ? `\n${e.method ?? ''} ${e.path}` : ''}`)
}

async function tellAdmins(text: string) {
  if (!env.TELEGRAM_BOT_TOKEN) return
  try {
    const admins = await prisma.user.findMany({ where: { role: 'admin', telegramChatId: { not: null }, blocked: false }, select: { telegramChatId: true } })
    for (const a of admins) {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: String(a.telegramChatId), text: `⚠️ Debate.kz: ${text}`, disable_web_page_preview: true }),
      }).catch(() => undefined)
    }
  } catch { /* no alert is better than a crash */ }
}
