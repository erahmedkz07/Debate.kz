import { expect, test } from '@playwright/test'
import { admin, newAccount, overflowing, signIn, tag } from './helpers'

// Names at their longest (a tournament of 120 letters, teams of 60, judges of 100), some written as one long word
// without spaces, as people do: no page on a phone may stick out past the screen.
const word = (n: number, base: string) => (base.repeat(Math.ceil(n / base.length))).slice(0, n)
test('longest names on a phone: nothing sticks out of the screen', async ({ page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 360, height: 780 })
  const org = await newAccount('UI Длинные Имена')
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date())
  const name = `${word(60, 'Республиканский')} ${tag()} ${word(52, 'турнирпоинтеллектуальнымдебатам')}`.slice(0, 120)
  const t = (await org.c('POST', '/tournaments', { name, city: 'Астана', startDate: day, endDate: day, level: 'school', description: word(400, 'Описание турнира без пробелов '), preliminaryRounds: 2, breakSize: 2, maxTeams: 20, registrationOpen: true, requireApproval: true, languages: ['ru'] })).data
  await (await admin())('PATCH', `/admin/tournaments/${t.id}`, { moderation: 'approved' })
  await org.c('PATCH', `/tournaments/${t.id}`, { leagues: [{ key: 'ru', name: word(40, 'Русскаялига'), language: 'ru' }, { key: 'kz', name: word(40, 'Қазақлигасы'), language: 'kz' }] })
  const teams = (k: string) => [word(60, `Команда${k}безпробелов`), `Республиканская физико-математическая школа ${k}`.slice(0, 60), word(59, `Ұлттықзияткерлікмектебі${k}`) + k, `НИШ ${k}`]
  await org.c('POST', `/tournaments/${t.id}/teams/bulk`, { league: 'ru', names: teams('р') })
  await org.c('POST', `/tournaments/${t.id}/teams/bulk`, { league: 'kz', names: teams('қ') })
  await org.c('POST', `/tournaments/${t.id}/judges/bulk`, { names: [word(100, 'Ахметжановааружанмаратқызы'), 'Судья Екі', word(100, 'Председательсудейскойколлегии '), 'Судья Төрт'] })
  await org.c('PATCH', `/tournaments/${t.id}`, { status: 'ongoing' })
  let d = (await org.c('GET', `/tournaments/${t.id}`)).data
  await org.c('POST', `/rounds/${d.rounds[0].id}/draw`, { addSwing: false })
  await org.c('PATCH', `/rounds/${d.rounds[0].id}`, { leagueMotions: { ru: { motion: word(300, 'Эта палата запретит телефоны в школах ') }, kz: { motion: word(300, 'Бұлпалатамектептетелефонғатыйымсалады') } }, status: 'released' })
  d = (await org.c('GET', `/tournaments/${t.id}`)).data
  const judge = d.judges.find((j: { id: string }) => d.debates.some((x: { judgeIds: string[] }) => x.judgeIds[0] === j.id))
  const room = d.debates.find((x: { judgeIds: string[] }) => x.judgeIds[0] === judge.id)

  const bad: string[] = []
  const check = async (path: string) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle').catch(() => undefined)
    await page.waitForTimeout(300)
    const o = await overflowing(page)
    if (o.length) bad.push(`${path}: ${o.slice(0, 2).join(' | ')}`)
  }
  for (const tab of ['', '?tab=teams', '?tab=draw', '?tab=results', '?tab=speakers', '?tab=judges']) await check(`/tournaments/${t.id}${tab}`)
  await check('/tournaments')
  await check(`/j/${judge.accessKey}`)
  await check(`/j/${judge.accessKey}/ballot/${room.id}`)
  await signIn(page, org.email, org.password)
  for (const s of ['', '/teams', '/judges', '/rounds', '/draw', '/ballots', '/results', '/settings']) await check(`/dashboard/tournaments/${t.id}${s}`)
  await check('/dashboard')
  expect(bad, bad.join('\n')).toEqual([])
})

// certificates are printed on fixed A4 sheets: the longest names stay inside the sheet
test('longest names on the printed certificates stay inside the sheet', async ({ page }) => {
  test.setTimeout(300_000)
  const org = await newAccount('UI Длинные Дипломы')
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date())
  const name = `${word(60, 'Республиканский')} ${tag()} ${word(52, 'турнирпоинтеллектуальнымдебатам')}`.slice(0, 120)
  const t = (await org.c('POST', '/tournaments', { name, city: 'Астана', startDate: day, endDate: day, level: 'school', description: '', preliminaryRounds: 1, breakSize: 2, maxTeams: 20, registrationOpen: true, requireApproval: true, languages: ['ru'] })).data
  await (await admin())('PATCH', `/admin/tournaments/${t.id}`, { moderation: 'approved' })
  await org.c('POST', `/tournaments/${t.id}/teams/bulk`, { names: [word(60, 'Командабезпробелов'), 'Республиканская физико-математическая школа-интернат №1'.slice(0, 60), 'НИШ', 'БИЛ'] })
  await org.c('POST', `/tournaments/${t.id}/judges/bulk`, { names: [word(100, 'Ахметжановааружанмаратқызы'), 'Судья Екі'] })
  await org.c('PATCH', `/tournaments/${t.id}`, { status: 'ongoing' })
  let d = (await org.c('GET', `/tournaments/${t.id}`)).data
  await org.c('POST', `/rounds/${d.rounds[0].id}/draw`, { addSwing: false })
  await org.c('PATCH', `/rounds/${d.rounds[0].id}`, { motion: 'ЭП отменит оценки', status: 'released' })
  d = (await org.c('GET', `/tournaments/${t.id}`)).data
  for (const x of d.debates) await org.c('POST', `/debates/${x.id}/forfeit`, { side: 'opposition' })
  await org.c('PATCH', `/rounds/${d.rounds[0].id}`, { status: 'completed' })
  await org.c('POST', `/tournaments/${t.id}/break`)
  d = (await org.c('GET', `/tournaments/${t.id}`)).data
  for (const r of d.rounds.filter((x: { kind: string }) => x.kind === 'elimination')) {
    await org.c('POST', `/rounds/${r.id}/draw`, {})
    await org.c('PATCH', `/rounds/${r.id}`, { motion: 'ЭП отменит оценки', status: 'released' })
    const dd = (await org.c('GET', `/tournaments/${t.id}`)).data
    for (const x of dd.debates.filter((y: { roundId: string }) => y.roundId === r.id)) await org.c('POST', `/debates/${x.id}/forfeit`, { side: 'opposition' })
    await org.c('PATCH', `/rounds/${r.id}`, { status: 'completed' })
  }
  await org.c('PATCH', `/tournaments/${t.id}`, { status: 'finished' })
  await signIn(page, org.email, org.password)
  await page.goto(`/tournaments/${t.id}/certificates/print`)
  await expect(page.locator('.cert-sheet').first()).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(500)
  const out = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.cert-sheet')].flatMap((sheet, i) => {
    const box = sheet.getBoundingClientRect()
    return [...sheet.querySelectorAll<HTMLElement>('*')].filter(el => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && el.children.length === 0 && (r.right > box.right + 1 || r.bottom > box.bottom + 1 || r.left < box.left - 1)
    }).slice(0, 1).map(el => `sheet ${i + 1}: ${(el.innerText || el.tagName).slice(0, 40)}`)
  }))
  await page.screenshot({ path: 'test-results/long-cert.png' })
  expect(out, out.join('\n')).toEqual([])
})
