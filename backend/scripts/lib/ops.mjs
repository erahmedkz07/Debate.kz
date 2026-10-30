// Shared bits of the operations scripts (backup, restore check, monitor): the database address, the PostgreSQL tools
// and alerts to the admins in Telegram. Read-only toward the site's data.
import { existsSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

// the database address without Prisma's ?schema= (pg_dump and pg do not know it)
export function dbUrl(url = process.env.DATABASE_URL ?? '') {
  if (!url) throw new Error('DATABASE_URL is not set (run through npm run …, which reads backend/.env)')
  const u = new URL(url)
  u.searchParams.delete('schema')
  return u
}

// pg_dump / pg_restore / psql: PG_BIN if set, else the usual Windows install, else the PATH (Linux)
export function pgTool(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name
  if (process.env.PG_BIN) return path.join(process.env.PG_BIN, exe)
  for (const v of ['17', '16', '15']) {
    const p = `C:/Program Files/PostgreSQL/${v}/bin/${exe}`
    if (process.platform === 'win32' && existsSync(p)) return p
  }
  return exe
}

// Telegram alerts: to ALERT_CHAT_IDS (comma-separated; the server's ALERT_CHAT_ID, see deploy/, works too) if set, else
// to every admin who linked Telegram on the site. Without a bot token the alert is only printed.
export async function alert(text) {
  console.log(`[alert] ${text}`)
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  let ids = (process.env.ALERT_CHAT_IDS ?? process.env.ALERT_CHAT_ID ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (!ids.length) {
    const c = new pg.Client({ connectionString: dbUrl().toString() })
    try {
      await c.connect()
      ids = (await c.query(`select telegram_chat_id from users where role = 'admin' and telegram_chat_id is not null and not blocked`)).rows.map(r => String(r.telegram_chat_id))
    } catch { /* the database itself may be what is down */ } finally { await c.end().catch(() => undefined) }
  }
  for (const id of ids) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: id, text: `⚠️ Debate.kz: ${text}`, disable_web_page_preview: true }),
    }).catch(() => undefined)
  }
}

// the local date and time in file names: 2026-10-30_0830
export const stamp = (d = new Date()) => {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

// tar: on Windows the system one (bsdtar); Git's GNU tar would read "C:\…" as another computer's address
export const tarTool = () => (process.platform === 'win32' && existsSync('C:/Windows/System32/tar.exe') ? 'C:/Windows/System32/tar.exe' : 'tar')
