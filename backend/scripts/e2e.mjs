// End-to-end runner: the checks never touch the dev database.
// 1. derives a separate test DB (debatekz_test) from DATABASE_URL and creates it if missing
// 2. applies migrations and seeds it from scratch
// 3. starts its own API on port 4100 against that DB, runs e2e-checks.mjs, stops the API
// Usage: npm run test:e2e   (the dev server on :4000 may keep running)
import { spawn, execSync } from 'node:child_process'
import path from 'node:path'
import pg from 'pg'

const root = path.resolve(import.meta.dirname, '..')
const devUrl = new URL(process.env.DATABASE_URL ?? '')
if (!devUrl.pathname.slice(1)) throw new Error('DATABASE_URL is not set (run through npm run test:e2e)')

const testDb = `${devUrl.pathname.slice(1)}`.replace(/_dev$/, '') + '_test'
const testUrl = new URL(devUrl)
testUrl.pathname = `/${testDb}`
const PORT = 4100
const env = { ...process.env, DATABASE_URL: testUrl.toString(), PORT: String(PORT), NODE_ENV: 'test' }

// create the test database once (debate_app has CREATEDB)
const admin = new pg.Client({ connectionString: Object.assign(new URL(devUrl), { pathname: '/postgres' }).toString() })
await admin.connect()
const exists = (await admin.query('select 1 from pg_database where datname = $1', [testDb])).rowCount
if (!exists) {
  await admin.query(`create database "${testDb}"`)
  console.log(`created database ${testDb}`)
}
await admin.end()

const run = cmd => execSync(cmd, { cwd: root, env, stdio: ['ignore', 'ignore', 'inherit'] })
console.log(`preparing ${testDb}…`)
run('npx prisma migrate deploy')
run('npx prisma db seed -- --force')

// own API instance for the tests
const api = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: root, env, stdio: ['ignore', 'ignore', 'inherit'] })
const base = `http://localhost:${PORT}/api`
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${base}/health`)).ok) break } catch { /* not up yet */ }
    if (i > 60) throw new Error('test API did not start')
    await new Promise(r => setTimeout(r, 250))
  }
  process.env.API_URL = base
  await import('./e2e-checks.mjs')
} finally {
  api.kill()
}
