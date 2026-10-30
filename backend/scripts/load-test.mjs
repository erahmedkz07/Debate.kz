// Load test on a copy of the real data, on this computer. The site's database is only read (through the latest backup):
// 1. the newest backup (npm run backup) is restored into a separate database <db>_load
// 2. the API is started from it on port 4500 in production mode (its rate limit, its caches, its access log)
// 3. "visitors" open what people open during a tournament: the list, the tournament, the table, the bracket, a speaker's
//    page, the rating. Each visitor has its own address (X-Forwarded-For), as real people behind the proxy would.
//    Steps of 10, 50, 100 and 200 visitors clicking without pause; for each: requests per second and response times.
//    ("Visitors" here never stop: 200 of them load the API like thousands of people reading and clicking.)
// 4. the API is stopped, the copy is dropped.
// The test program runs on the same processor as the API and the database, so the numbers are a floor, not a ceiling.
// Usage: npm run load-test            (about a minute and a half)
//        npm run load-test -- --quick (5 seconds per step)
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { dbUrl, pgTool } from './lib/ops.mjs'

const root = path.resolve(import.meta.dirname, '..')
const backups = path.resolve(process.env.BACKUP_DIR ?? path.join(root, 'backups', 'auto'))
const live = dbUrl()
const loadName = `${live.pathname.slice(1)}_load`
const loadUrl = new URL(live); loadUrl.pathname = `/${loadName}`
const postgres = new URL(live); postgres.pathname = '/postgres'
const PORT = 4500
const BASE = `http://127.0.0.1:${PORT}/api`
const STEP_MS = process.argv.includes('--quick') ? 5_000 : 15_000
const STEPS = [10, 50, 100, 200]

const admin = async sql => {
  const c = new pg.Client({ connectionString: postgres.toString() })
  await c.connect()
  try { await c.query(sql) } finally { await c.end() }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0

// 1. the copy
const latest = readdirSync(backups).filter(f => /^debatekz-.*\.dump$/.test(f)).sort().at(-1)
if (!latest) throw new Error(`no backup in ${backups}: run npm run backup first`)
console.log(`restoring ${latest} into ${loadName}…`)
await admin(`drop database if exists "${loadName}"`)
await admin(`create database "${loadName}"`)
execFileSync(pgTool('pg_restore'), ['--no-owner', '--no-privileges', `--dbname=${loadUrl}`, path.join(backups, latest)], { stdio: ['ignore', 'ignore', 'inherit'] })

// the busiest public tournament and its speakers
const db = new pg.Client({ connectionString: loadUrl.toString() })
await db.connect()
const t = (await db.query(`select t.id, t.name, count(d.id)::int as debates from tournaments t join rounds r on r.tournament_id = t.id
  join debates d on d.round_id = r.id where t.visible group by t.id order by debates desc limit 1`)).rows[0]
if (!t) throw new Error('the copy has no public tournament with debates')
const speakers = (await db.query(`select s.id from speakers s join teams tm on tm.id = s.team_id where tm.tournament_id = $1 and not tm.swing`, [t.id])).rows.map(r => r.id)
await db.end()

// 2. the API, production mode, with harmless stand-ins: nothing is mailed when pages are read, no bot without a token
const storage = mkdtempSync(path.join(os.tmpdir(), 'debatekz-load-'))
const env = {
  ...process.env, NODE_ENV: 'production', PORT: String(PORT), DATABASE_URL: loadUrl.toString(),
  CLIENT_ORIGIN: 'https://debate.kz.test', APP_URL: 'https://debate.kz.test', JWT_SECRET: randomBytes(48).toString('hex'),
  SMTP_HOST: 'smtp.invalid', SMTP_USER: 'load@debate.kz.test', SMTP_PASS: 'none', TELEGRAM_BOT_TOKEN: '',
  GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
  STORAGE_DIR: storage.replace(/^[A-Za-z]:/, '').replaceAll('\\', '/'), // an absolute path, as production requires
}
const api = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: root, env, stdio: ['ignore', 'ignore', 'inherit'] })
const cleanup = async () => {
  api.kill()
  await sleep(500)
  await admin(`drop database if exists "${loadName}"`).catch(() => undefined)
  rmSync(storage, { recursive: true, force: true })
}
process.on('SIGINT', async () => { await cleanup(); process.exit(130) })

try {
  for (let i = 0; ; i++) {
    if (await fetch(`${BASE}/health`).then(r => r.ok, () => false)) break
    if (i > 60) throw new Error('the API did not start in 30 s')
    await sleep(500)
  }

  // what a visitor opens, and how often (weights)
  const pages = [
    ['список турниров', 15, () => '/tournaments'],
    ['турнир', 30, () => `/tournaments/${t.id}`],
    ['таблица', 25, () => `/tournaments/${t.id}/standings`],
    ['сетка плей-офф', 10, () => `/tournaments/${t.id}/bracket`],
    ['страница спикера', 10, () => `/tournaments/${t.id}/speakers/${speakers[Math.floor(Math.random() * speakers.length)]}`],
    ['рейтинг', 10, () => '/rating'],
  ]
  const total = pages.reduce((s, p) => s + p[1], 0)
  const pick = () => { let r = Math.random() * total; for (const p of pages) if ((r -= p[1]) < 0) return p; return pages[0] }
  const get = async (url, ip) => {
    const t0 = performance.now()
    const r = await fetch(BASE + url, { headers: { 'X-Forwarded-For': ip } })
    await r.arrayBuffer()
    return { ms: performance.now() - t0, ok: r.ok, status: r.status }
  }

  // the first, uncached computation of the heavy pages (a fresh round: the cache is empty)
  console.log(`\nтурнир: ${t.name} (${t.debates} дебатов, ${speakers.length} спикеров)`)
  for (const [name, , url] of pages) {
    const r = await get(url(), '10.255.0.1')
    console.log(`  первый запрос, ${name}: ${r.ms.toFixed(0)} мс${r.ok ? '' : ` (ответ ${r.status})`}`)
  }

  console.log(`\nпосетителей | запросов/с | p50 мс | p95 мс | p99 мс | ошибок`)
  const perPage = new Map()
  for (const users of STEPS) {
    const times = [], errors = new Map()
    const until = Date.now() + STEP_MS
    const started = performance.now()
    await Promise.all(Array.from({ length: users }, async (_, u) => {
      // a new address every 200 requests: a person does not click 200 times in a row (the API allows 1200 a minute)
      let n = 0
      const ip = () => `10.${u % 250}.${Math.floor(n / 200) % 250}.${1 + (users % 250)}`
      while (Date.now() < until) {
        const [name, , url] = pick()
        try {
          const r = await get(url(), ip()); n++
          times.push(r.ms)
          if (!r.ok) errors.set(r.status, (errors.get(r.status) ?? 0) + 1)
          if (users === STEPS.at(-1)) perPage.set(name, [...(perPage.get(name) ?? []), r.ms])
        } catch { errors.set('сеть', (errors.get('сеть') ?? 0) + 1) }
      }
    }))
    const secs = (performance.now() - started) / 1000
    times.sort((a, b) => a - b)
    const errs = [...errors].map(([k, v]) => `${k}: ${v}`).join(', ') || '0'
    console.log(`${String(users).padStart(11)} | ${(times.length / secs).toFixed(0).padStart(10)} | ${pct(times, 0.5).toFixed(0).padStart(6)} | ${pct(times, 0.95).toFixed(0).padStart(6)} | ${pct(times, 0.99).toFixed(0).padStart(6)} | ${errs}`)
  }
  console.log(`\nпри ${STEPS.at(-1)} посетителях, по страницам (p50 / p95 мс):`)
  for (const [name, list] of perPage) {
    list.sort((a, b) => a - b)
    console.log(`  ${name.padEnd(18)} ${pct(list, 0.5).toFixed(0).padStart(5)} / ${pct(list, 0.95).toFixed(0)}`)
  }
} finally {
  await cleanup()
}
