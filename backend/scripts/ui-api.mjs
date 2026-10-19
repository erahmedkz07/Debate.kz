// The API for the UI tests (Playwright, frontend/tests/ui): like the e2e runner, it never touches the dev database.
// 1. derives the test DB (debatekz_test) from DATABASE_URL and creates it if missing
// 2. applies migrations and seeds it from scratch (admin@debate.kz / demo1234 and the demo data)
// 3. serves the API on port 4300 until Playwright stops it
// Usage: started by the UI tests (npm run test:ui in frontend); do not run it together with npm run test:e2e
// (both use the same test database).
import { spawn, execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const root = path.resolve(import.meta.dirname, '..')
const devUrl = new URL(process.env.DATABASE_URL ?? '')
if (!devUrl.pathname.slice(1)) throw new Error('DATABASE_URL is not set (run through npm run test:ui-api)')
const testDb = `${devUrl.pathname.slice(1)}`.replace(/_dev$/, '') + '_test'
if (!testDb.endsWith('_test')) throw new Error('not a test database')
const testUrl = new URL(devUrl)
testUrl.pathname = `/${testDb}`
const PORT = 4300
const env = {
  ...process.env, DATABASE_URL: testUrl.toString(), PORT: String(PORT), NODE_ENV: 'test',
  // no real letters or Telegram messages from tests
  SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', TELEGRAM_BOT_TOKEN: '',
  // the UI tests open the site on :5180
  CLIENT_ORIGIN: 'http://localhost:5180', APP_URL: 'http://localhost:5180',
}

const admin = new pg.Client({ connectionString: Object.assign(new URL(devUrl), { pathname: '/postgres' }).toString() })
await admin.connect()
if (!(await admin.query('select 1 from pg_database where datname = $1', [testDb])).rowCount) await admin.query(`create database "${testDb}"`)
await admin.end()

const run = cmd => execSync(cmd, { cwd: root, env, stdio: ['ignore', 'ignore', 'inherit'] })
console.log(`preparing ${testDb}…`)
run('npx prisma migrate deploy')
run('npx prisma db seed -- --force')
rmSync(path.join(root, 'test-storage'), { recursive: true, force: true })

const api = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: root, env, stdio: 'inherit' })
const stop = () => { api.kill(); process.exit(0) }
for (const s of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(s, stop)
api.on('exit', code => process.exit(code ?? 0))
