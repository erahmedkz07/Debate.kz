import type { Page } from '@playwright/test'

// Data for the UI tests is made through the test API (:4300, the test database only): fast and independent of the
// screens under test. Each test makes its own account and tournament, with unique names.
export const API = 'http://localhost:4300/api'
export const tag = () => Math.random().toString(36).slice(2, 8)

type Res = { status: number; data: any } // eslint-disable-line @typescript-eslint/no-explicit-any
export function client() {
  let cookie = ''
  return async (method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
    const set = r.headers.getSetCookie?.() ?? []
    if (set.length) cookie = set.map(c => c.split(';')[0]).join('; ')
    const text = await r.text()
    let data: unknown = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    return { status: r.status, data }
  }
}

// a verified account; its password is random and lives only in this run
export async function newAccount(name: string) {
  const c = client()
  const email = `ui.${tag()}@ui.test`
  const password = `ui-${tag()}${tag()}`
  const reg = await c('POST', '/auth/register', { name, email, password, language: 'ru', consent: true, phone: '+7 701 000 00 03' })
  if (reg.data?.devVerificationToken) await c('POST', '/auth/verify-email', { token: reg.data.devVerificationToken })
  return { c, email, password, id: reg.data?.user?.id as string }
}

export async function admin() {
  const c = client()
  await c('POST', '/auth/login', { email: 'admin@debate.kz', password: 'demo1234' })
  return c
}

const day = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date(Date.now() + n * 864e5))

// A tournament with a Kazakh and a Russian league, 4 teams in each, judges by name, round 1 drawn and released.
export async function leagueTournament() {
  const acc = await newAccount('UI Организатор')
  const org = acc
  const ad = await admin()
  const name = `UI турнир ${tag()}`
  const t = (await org.c('POST', '/tournaments', { name, city: 'Астана', startDate: day(0), endDate: day(0), level: 'school', description: '', preliminaryRounds: 2, breakSize: 2, maxTeams: 20, registrationOpen: true, requireApproval: true, languages: ['kz', 'ru'] })).data
  await ad('PATCH', `/admin/tournaments/${t.id}`, { moderation: 'approved' })
  await org.c('PATCH', `/tournaments/${t.id}`, { leagues: [{ key: 'ru', name: 'Русская лига', language: 'ru' }, { key: 'kz', name: 'Қазақ лигасы', language: 'kz' }] })
  await org.c('POST', `/tournaments/${t.id}/teams/bulk`, { league: 'ru', names: ['Рус Альфа', 'Рус Бета', 'Рус Гамма', 'Рус Дельта'] })
  await org.c('POST', `/tournaments/${t.id}/teams/bulk`, { league: 'kz', names: ['Қаз Алфа', 'Қаз Бета', 'Қаз Гамма', 'Қаз Дельта'] })
  await org.c('POST', `/tournaments/${t.id}/judges/bulk`, { names: ['Судья Бір', 'Судья Екі', 'Судья Үш', 'Судья Төрт'] })
  await org.c('PATCH', `/tournaments/${t.id}`, { status: 'ongoing' })
  let d = (await org.c('GET', `/tournaments/${t.id}`)).data
  const r1 = d.rounds[0]
  await org.c('POST', `/rounds/${r1.id}/draw`, { addSwing: false })
  await org.c('PATCH', `/rounds/${r1.id}`, { leagueMotions: { ru: { motion: 'ЭП запретит телефоны в школах' }, kz: { motion: 'БП мектепте телефонға тыйым салады' } }, status: 'released' })
  d = (await org.c('GET', `/tournaments/${t.id}`)).data
  // org: the API client plus the account's email and password, to sign the browser in as the organizer
  return { org: Object.assign(org.c, { email: org.email, password: org.password }) as typeof org.c & { email: string; password: string }, id: t.id as string, name, details: d }
}

// signs the browser in with an account made by the helpers (the session cookie is set on the site's own address)
export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/')
  const status = await page.evaluate(async ([e, p]) => (await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) })).status, [email, password])
  if (status !== 200) throw new Error(`sign-in failed: ${status}`)
}

// nothing on the page sticks out past the right edge of the screen (a table may scroll inside its own box)
export async function overflowing(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const bad: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const r = el.getBoundingClientRect()
      if (!r.width || r.right <= vw + 1) continue
      let p = el.parentElement, inBox = false
      while (p && p !== document.body) { if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX)) { inBox = true; break } p = p.parentElement }
      if (!inBox) bad.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`)
    }
    return bad.slice(0, 5)
  })
}
