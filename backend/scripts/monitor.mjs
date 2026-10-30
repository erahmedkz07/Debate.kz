// Watches the site: every minute it asks the API's health check (which asks the database). Two failures in a row
// and the admins get "the site is down" in Telegram; when it answers again, "back up, N minutes down". It also checks
// that a fresh backup exists (not older than 26 hours), once a day.
// Usage: npm run monitor            (runs until stopped: a service on the server, see docs/OPERATIONS.md)
//        npm run monitor -- --once  (one check, for a scheduler that starts it every few minutes)
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { alert } from './lib/ops.mjs'

const root = path.resolve(import.meta.dirname, '..')
const URL_ = process.env.MONITOR_URL ?? `http://127.0.0.1:${process.env.PORT ?? 4000}/api/health`
const EVERY_MS = 60_000
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR ?? path.join(root, 'backups', 'auto'))
const STATE = path.join(path.resolve(process.env.STORAGE_DIR ?? root), 'logs', 'monitor-state.json')

const load = () => { try { return JSON.parse(readFileSync(STATE, 'utf8')) } catch { return { fails: 0, downSince: null, alerted: false, backupAlertDay: null } } }
const save = s => { mkdirSync(path.dirname(STATE), { recursive: true }); writeFileSync(STATE, JSON.stringify(s)) }

async function check() {
  const s = load()
  const started = Date.now()
  let ok = false, why = ''
  try {
    const r = await fetch(URL_, { signal: AbortSignal.timeout(10_000) })
    ok = r.ok
    if (!ok) why = `ответ ${r.status}`
  } catch (e) {
    why = e instanceof Error && e.name === 'TimeoutError' ? 'нет ответа 10 секунд' : 'не отвечает'
  }
  const ms = Date.now() - started
  if (ok) {
    if (s.alerted) await alert(`сайт снова работает (не работал ${Math.max(1, Math.round((Date.now() - s.downSince) / 60000))} мин)`)
    Object.assign(s, { fails: 0, downSince: null, alerted: false })
    console.log(`${new Date().toISOString()} ok ${ms} ms`)
  } else {
    s.fails += 1
    s.downSince ??= Date.now()
    console.log(`${new Date().toISOString()} FAIL (${why})`)
    if (s.fails >= 2 && !s.alerted) { await alert(`сайт недоступен: ${why} (${URL_})`); s.alerted = true }
  }
  // a fresh backup, once a day
  const today = new Date().toISOString().slice(0, 10)
  if (s.backupAlertDay !== today && existsSync(BACKUP_DIR)) {
    const dumps = readdirSync(BACKUP_DIR).filter(f => /^(?:debatekz|db)-.*\.dump$/.test(f)).map(f => statSync(path.join(BACKUP_DIR, f)).mtimeMs)
    const newest = dumps.length ? Math.max(...dumps) : 0
    if (Date.now() - newest > 26 * 3600_000) { await alert(`нет свежего бэкапа: последний ${newest ? new Date(newest).toLocaleString('ru-RU') : 'не найден'}`); s.backupAlertDay = today }
  }
  save(s)
}

if (process.argv.includes('--once')) await check()
else {
  console.log(`monitor: ${URL_} every ${EVERY_MS / 1000} s`)
  for (;;) { await check(); await new Promise(r => setTimeout(r, EVERY_MS)) }
}
