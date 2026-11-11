import { expect, test } from '@playwright/test'
import { admin, newAccount, signIn, tag } from './helpers'

const day = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date(Date.now() + n * 864e5))

test('a judge has a "Judging" section in the profile: the tournament, the round, chair or wing', async ({ page }) => {
  const org = await newAccount('UI Судейство Организатор')
  const ad = await admin()
  const name = `UI судейство ${tag()}`
  const t = (await org.c('POST', '/tournaments', { name, city: 'Астана', startDate: day(0), endDate: day(0), level: 'school', description: '', preliminaryRounds: 2, breakSize: 2, maxTeams: 8, registrationOpen: true, requireApproval: true, languages: ['ru'] })).data
  await ad('PATCH', `/admin/tournaments/${t.id}`, { moderation: 'approved' })
  await org.c('POST', `/tournaments/${t.id}/teams/bulk`, { names: ['Альфа', 'Бета', 'Гамма', 'Дельта'] })
  // a judge with an account (through the invite) and one by name: two rooms need two judges
  const judge = await newAccount('UI Судья Профиль')
  const url = (await org.c('POST', `/tournaments/${t.id}/invites`, { kind: 'judge' })).data.url as string
  expect((await judge.c('POST', `/invites/${url.split('/invite/')[1]}/accept`)).status).toBe(200)
  await org.c('POST', `/tournaments/${t.id}/judges/bulk`, { names: ['Судья Без Аккаунта'] })
  await org.c('PATCH', `/tournaments/${t.id}`, { status: 'ongoing' })
  const r1 = (await org.c('GET', `/tournaments/${t.id}`)).data.rounds[0]
  await org.c('POST', `/rounds/${r1.id}/draw`, { addSwing: false })
  await org.c('PATCH', `/rounds/${r1.id}`, { motion: 'ЭП запретит телефоны в школах', status: 'released' })

  await signIn(page, judge.email, judge.password)
  await page.goto('/me?tab=judging')
  const tab = page.getByRole('tab', { name: /Судейство/ })
  await expect(tab).toBeVisible()
  await expect(page.getByText(name)).toBeVisible()
  await expect(page.getByText(/Председатель|Боковой судья/).first()).toBeVisible()
  await expect(page.getByText('Раундов судил(а)')).toBeVisible()

  // someone who never judged has no such section
  const speaker = await newAccount('UI Не Судья')
  await page.context().clearCookies()
  await signIn(page, speaker.email, speaker.password)
  await page.goto('/me?tab=settings')
  await expect(page.getByRole('tab', { name: 'Настройки профиля' })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Судейство/ })).toHaveCount(0)
})

test('the public profile switch: off closes the page to others, the person still sees it', async ({ page, browser }) => {
  const acc = await newAccount('UI Скрытый Профиль')
  await signIn(page, acc.email, acc.password)
  await page.goto('/me?tab=settings')
  const sw = page.getByRole('switch', { name: 'Показывать мой профиль' })
  await expect(sw).toHaveAttribute('aria-checked', 'true')
  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByText(/Профиль скрыт: страницу видите только вы/)).toBeVisible()

  await page.goto(`/people/${acc.id}`)
  await expect(page.getByText(/эту страницу видите только вы/)).toBeVisible()
  // a visitor without an account
  const other = await browser.newPage()
  await other.goto(`/people/${acc.id}`)
  await expect(other.getByText(acc.email)).toHaveCount(0)
  await expect(other.getByRole('heading', { name: 'UI Скрытый Профиль' })).toHaveCount(0)
  await other.close()

  // and back on
  await page.goto('/me?tab=settings')
  await page.getByRole('switch', { name: 'Показывать мой профиль' }).click()
  await expect(page.getByRole('switch', { name: 'Показывать мой профиль' })).toHaveAttribute('aria-checked', 'true')
})

test('the Telegram card: the bot, its status and what it does', async ({ page }) => {
  const acc = await newAccount('UI Телеграм Карточка')
  await signIn(page, acc.email, acc.password)
  await page.goto('/me?tab=settings')
  await expect(page.getByText('Не подключён').first()).toBeVisible()
  await expect(page.getByText(/Вход на сайт кнопкой «Войти через Telegram»/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Подключить/ })).toBeVisible()
})
