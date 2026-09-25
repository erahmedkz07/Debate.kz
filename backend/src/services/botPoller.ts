import { env } from '../lib/env.js'
import { getUpdates, setCommands, TelegramError } from '../lib/telegram.js'
import { BOT_COMMANDS, handleUpdate } from './bot.js'

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
  await setCommands(BOT_COMMANDS).catch(e => console.error('[bot] setMyCommands:', e.message))
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
