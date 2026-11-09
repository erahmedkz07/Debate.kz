import { expect, test, type Page } from '@playwright/test'
import { admin, leagueTournament, signIn } from './helpers'

// Every page of the site, as each kind of visitor, on a computer and on a phone: no script error, no failed request
// (5xx, or 4xx other than the expected ones), nothing wider than the screen. Tabs are opened one by one.
type Issue = { page: string; kind: string; detail: string }

async function watch(page: Page, issues: Issue[], where: () => string) {
  page.on('pageerror', e => issues.push({ page: where(), kind: 'script error', detail: e.message.slice(0, 300) }))
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR/.test(m.text())) issues.push({ page: where(), kind: 'console', detail: m.text().slice(0, 300) }) })
  page.on('response', r => {
    const u = r.url()
    if (!u.includes('/api/')) return
    // expected answers: not signed in, a speaker without a profile, a missing optional resource
    if (r.status() >= 500 || (r.status() >= 400 && ![401, 404].includes(r.status()))) issues.push({ page: where(), kind: `HTTP ${r.status()}`, detail: `${r.request().method()} ${u.replace(/^.*\/api/, '/api')}` })
  })
}

async function visit(page: Page, issues: Issue[], path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.waitForTimeout(300)
  const over = await page.evaluate(() => {
    const w = document.documentElement.clientWidth
    if (document.documentElement.scrollWidth <= w + 1) return null
    // the widest element that sticks out (a table inside a scroll box does not count)
    const out = [...document.querySelectorAll<HTMLElement>('body *')].filter(el => {
      const r = el.getBoundingClientRect()
      if (r.right <= w + 1 || r.width === 0) return false
      for (let p = el.parentElement; p; p = p.parentElement) if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX)) return false
      return true
    })
    return out.slice(0, 2).map(el => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`).join(' | ') || 'page'
  })
  if (over) issues.push({ page: path, kind: 'wider than the screen', detail: over })
}

async function finishedTournament() {
  const t = await leagueTournament()
  const org = t.org
  const play = async (roundId: string, draw = true) => {
    if (draw) await org('POST', `/rounds/${roundId}/draw`, { addSwing: true })
    await org('PATCH', `/rounds/${roundId}`, { motion: 'ЭП отменит экзамены', leagueMotions: { ru: { motion: 'ЭП отменит экзамены' }, kz: { motion: 'БП емтихандарды жояды' } }, status: 'released' })
    const d = (await org('GET', `/tournaments/${t.id}`)).data
    for (const x of d.debates.filter((y: { roundId: string; winner?: string }) => y.roundId === roundId && !y.winner)) await org('POST', `/debates/${x.id}/forfeit`, { side: 'opposition' })
    await org('PATCH', `/rounds/${roundId}`, { status: 'completed' })
  }
  let d = t.details
  for (const x of d.debates) await org('POST', `/debates/${x.id}/forfeit`, { side: 'opposition' })
  await org('PATCH', `/rounds/${d.rounds[0].id}`, { status: 'completed' })
  await play(d.rounds[1].id)
  await org('POST', `/tournaments/${t.id}/break`)
  d = (await org('GET', `/tournaments/${t.id}`)).data
  for (const r of d.rounds.filter((x: { kind: string }) => x.kind === 'elimination')) await play(r.id)
  await org('PATCH', `/tournaments/${t.id}`, { status: 'finished' })
  return t
}

for (const device of ['computer', 'phone'] as const) {
  test(`every page works (${device})`, async ({ page }) => {
    test.setTimeout(600_000)
    if (device === 'phone') await page.setViewportSize({ width: 390, height: 844 })
    const issues: Issue[] = []
    let current = ''
    await watch(page, issues, () => current)
    const go = async (path: string) => { current = path; await visit(page, issues, path) }

    const live = await leagueTournament()
    const done = await finishedTournament()
    const d = (await done.org('GET', `/tournaments/${done.id}`)).data
    const liveD = live.details
    const certs = (await done.org('GET', `/tournaments/${done.id}/certificates`)).data ?? []
    const links = (await live.org('POST', `/tournaments/${live.id}/speaker-links`)).data
    const judge = liveD.judges.find((j: { id: string }) => liveD.debates.some((x: { judgeIds: string[] }) => x.judgeIds[0] === j.id))
    const room = liveD.debates.find((x: { judgeIds: string[] }) => x.judgeIds[0] === judge.id)
    const speaker = d.teams.find((x: { swing?: boolean }) => !x.swing).speakers[0]
    const me = (await done.org('GET', '/auth/me')).data.user

    // a guest
    for (const p of ['/', '/tournaments', '/tournaments?kind=local', '/rating', '/rating?tab=speakers', '/rating?tab=clubs', '/motions', '/timer', '/calculator', '/break-calculator',
      '/teammates', '/clubs', '/tools', '/formats', '/reference', '/news', '/safety', '/about', '/privacy', '/terms', '/pricing', '/login', '/register', '/forgot-password', '/no-such-page']) await go(p)
    for (const tab of ['', '?tab=teams', '?tab=draw', '?tab=playoffs', '?tab=results', '?tab=speakers', '?tab=judges', '?tab=reviews']) {
      await go(`/tournaments/${live.id}${tab}`)
      await go(`/tournaments/${done.id}${tab}`)
    }
    await go(`/tournaments/${live.id}/projector`)
    await go(`/tournaments/${done.id}/speakers/${speaker.id}`)
    if (certs[0]) { await go(`/verify/${certs[0].code}`); await go(`/certificates/${certs[0].code}`) }
    await go(`/j/${judge.accessKey}`)
    await go(`/j/${judge.accessKey}/ballot/${room.id}`)
    await go(`/s/${links[0].speakers[0].accessKey}`)

    // the organizer
    await signIn(page, done.org.email, done.org.password)
    await go('/dashboard'); await go('/dashboard/tournaments/new'); await go('/me'); await go('/notifications'); await go('/judge')
    for (const tab of ['progress', 'debates', 'certificates', 'registrations', 'club', 'settings']) await go(`/me?tab=${tab}`)
    await go(`/people/${me.id}`)
    for (const id of [done.id]) {
      for (const s of ['', '/teams', '/judges', '/schedule', '/rounds', '/draw', '/ballots', '/results', '/settings', '/settings?part=place', '/settings?part=access', '/settings?part=danger'])
        await go(`/dashboard/tournaments/${id}${s}`)
      await go(`/tournaments/${id}/report`); await go(`/tournaments/${id}/certificates/print`); await go(`/tournaments/${id}/speaker-links/print`)
    }
    await signIn(page, live.org.email, live.org.password)
    for (const s of ['', '/teams', '/judges', '/schedule', '/rounds', '/draw', '/ballots', '/results', '/settings', '/settings?part=place', '/settings?part=conduct', '/settings?part=access'])
      await go(`/dashboard/tournaments/${live.id}${s}`)
    await go(`/ballot/${room.id}`)

    // the admin
    const a = await admin()
    void a
    await signIn(page, 'admin@debate.kz', 'demo1234')
    for (const tab of ['', '?tab=tournaments', '?tab=users', '?tab=clubs', '?tab=payments', '?tab=strikes', '?tab=log', '?tab=analytics']) await go(`/admin${tab}`)
    await go('/safety/reports')

    const report = issues.map(i => `${i.page} — ${i.kind}: ${i.detail}`)
    console.log(`\n[crawl ${device}] ${report.length} issue(s)\n${report.join('\n')}`)
    expect(report, report.join('\n')).toEqual([])
  })
}
