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
