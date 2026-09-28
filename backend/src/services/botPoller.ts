import { env } from '../lib/env.js'
import { getCommands, getDescription, getShortDescription, getUpdates, setCommands, setDescription, setShortDescription, TelegramError } from '../lib/telegram.js'
import { botCommands, handleUpdate } from './bot.js'
import { T } from './botTexts.js'

// Long polling: works on localhost without a public URL. For production behind HTTPS a webhook can replace it.
// Only one process may poll a bot token at a time (Telegram answers 409 to the second one).
let running = false

export function startBot() {
  if (running || env.NODE_ENV === 'test' || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_BOT_USERNAME) return
  running = true
  void loop()
}

export function stopBot() {
  running = false
}

async function loop() {
  console.log(`Telegram bot @${env.TELEGRAM_BOT_USERNAME} started (long polling)`)
  // in the background: polling starts at once even if Telegram asks to wait with the profile
  void syncProfileSoon()
  let offset = 0
  let backoff = 1000
  while (running) {
    try {
      const updates = (await getUpdates(offset)) ?? []
      backoff = 1000
      for (const u of updates) {
        offset = u.update_id + 1
        // one bad update must not stop the bot
        await handleUpdate(u).catch(e => console.error('[bot] update failed:', e instanceof Error ? e.message : e))
      }
    } catch (e) {
      if (e instanceof TelegramError && e.code === 401) {
        console.error('[bot] TELEGRAM_BOT_TOKEN is invalid; the bot is stopped')
        running = false
        return
      }
      if (e instanceof TelegramError && e.code === 409) console.error('[bot] another process is polling this bot (or a webhook is set)')
      else console.error('[bot] polling error:', e instanceof Error ? e.message : e)
      await new Promise(r => setTimeout(r, backoff))
      backoff = Math.min(backoff * 2, 60_000)
    }
  }
}

// a network hiccup or a rate limit must not leave the old menu: try again later (as long as Telegram asks, if it says)
async function syncProfileSoon() {
  for (let attempt = 1; attempt <= 6 && running; attempt++) {
    try {
      await syncProfile()
      console.log('[bot] command menu and profile are up to date')
      return
    } catch (e) {
      const wait = e instanceof TelegramError && e.retryAfter ? e.retryAfter * 1000 + 1000 : attempt * 60_000
      console.error(`[bot] profile setup: ${e instanceof Error ? e.message : e}; retry in ${Math.round(wait / 1000)} s`)
      await new Promise(r => setTimeout(r, wait).unref())
    }
  }
}

// The command menu and the profile texts: Russian by default, Kazakh for people whose Telegram is in Kazakh.
// Telegram rate-limits these calls hard, so each one is sent only when it differs from what is already set
// (a dev server restarting on every save would otherwise be locked out for the better part of an hour).
async function syncProfile() {
  for (const [lang, code] of [['ru', undefined], ['kz', 'kk']] as const) {
    const commands = botCommands(lang)
    const now = (await getCommands(code)) ?? []
    if (JSON.stringify(now) !== JSON.stringify(commands)) await setCommands(commands, code)
    if ((await getDescription(code))?.description !== T[lang].description) await setDescription(T[lang].description, code)
    if ((await getShortDescription(code))?.short_description !== T[lang].shortDescription) await setShortDescription(T[lang].shortDescription, code)
  }
}
