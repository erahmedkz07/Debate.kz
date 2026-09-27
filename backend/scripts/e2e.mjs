// End-to-end runner: the checks never touch the dev database.
// 1. derives a separate test DB (debatekz_test) from DATABASE_URL and creates it if missing
// 2. applies migrations and seeds it from scratch
// 3. starts its own API on port 4100 against that DB, runs e2e-checks.mjs, stops the API
// Usage: npm run test:e2e   (the dev server on :4000 may keep running)
import { spawn, execSync } from 'node:child_process'
import path from 'node:path'
import pg from 'pg'
import http from 'node:http'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const devUrl = new URL(process.env.DATABASE_URL ?? '')
if (!devUrl.pathname.slice(1)) throw new Error('DATABASE_URL is not set (run through npm run test:e2e)')

const testDb = `${devUrl.pathname.slice(1)}`.replace(/_dev$/, '') + '_test'
const testUrl = new URL(devUrl)
testUrl.pathname = `/${testDb}`
const PORT = 4100
const GOOGLE_PORT = 4199
const env = {
  ...process.env, DATABASE_URL: testUrl.toString(), PORT: String(PORT), NODE_ENV: 'test',
  // tests never send real letters, even when SMTP is configured in .env
  SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '',
  // "Google" is played locally by fakeGoogle below
  GOOGLE_CLIENT_ID: 'e2e-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'e2e-secret-0123456789',
  GOOGLE_AUTH_URL: `http://localhost:${GOOGLE_PORT}/auth`, GOOGLE_TOKEN_URL: `http://localhost:${GOOGLE_PORT}/token`,
}

// A stand-in for Google's token endpoint. The checks build the "authorization code" themselves:
// base64url JSON { claims, challenge } — the claims of the ID token to return and the PKCE challenge
// taken from the authorization URL. Like Google, it rejects a wrong client secret, redirect URI or PKCE verifier.
const photo = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#009bc9' } }).png().toBuffer()
const fakeGoogle = http.createServer(async (req, res) => {
  if (req.url === '/photo.png') return res.writeHead(200, { 'Content-Type': 'image/png' }).end(photo)
  if (req.method !== 'POST' || req.url !== '/token') return res.writeHead(404).end()
  let raw = ''
  for await (const chunk of req) raw += chunk
  const f = new URLSearchParams(raw)
  const reject = () => res.writeHead(400, { 'Content-Type': 'application/json' }).end('{"error":"invalid_grant"}')
  let code
  try { code = JSON.parse(Buffer.from(f.get('code') ?? '', 'base64url').toString()) } catch { return reject() }
  const challenge = createHash('sha256').update(f.get('code_verifier') ?? '').digest('base64url')
  if (f.get('client_id') !== env.GOOGLE_CLIENT_ID || f.get('client_secret') !== env.GOOGLE_CLIENT_SECRET
    || f.get('grant_type') !== 'authorization_code' || !f.get('redirect_uri')?.endsWith('/api/auth/google/callback')
    || challenge !== code.challenge) return reject()
  const part = o => Buffer.from(JSON.stringify(o)).toString('base64url')
  const idToken = `${part({ alg: 'RS256' })}.${part(code.claims)}.signature`
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id_token: idToken, access_token: 'x', token_type: 'Bearer' }))
})
await new Promise(r => fakeGoogle.listen(GOOGLE_PORT, r))
fakeGoogle.unref() // never keeps the runner alive on an early failure

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
  process.env.GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID
  process.env.FAKE_GOOGLE = `http://localhost:${GOOGLE_PORT}`
  await import('./e2e-checks.mjs')
} finally {
  api.kill()
  fakeGoogle.close()
}
