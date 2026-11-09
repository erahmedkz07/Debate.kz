import { expect, test } from '@playwright/test'
import { admin, newAccount, overflowing, signIn, tag } from './helpers'

// The admin on a phone: a new tournament is found among those waiting, approved; another is refused with a reason
test('admin on a phone: approves one new tournament and refuses another with a reason', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const host = await newAccount('UI Новый Организатор')
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date(Date.now() + 10 * 864e5))
  const make = async (name: string) => (await host.c('POST', '/tournaments', { name, city: 'Астана', startDate: day, endDate: day, level: 'school', description: '', preliminaryRounds: 2, breakSize: 2, maxTeams: 8, registrationOpen: true, requireApproval: true, languages: ['ru'] })).data
  const good = await make(`UI хороший ${tag()}`)
  const bad = await make(`UI спорный ${tag()}`)
  await signIn(page, 'admin@debate.kz', 'demo1234')
  await page.goto('/admin?tab=tournaments')
  const row = (name: string) => page.locator('tr, li, [data-row]').filter({ hasText: name }).filter({ visible: true }).first()
  await expect(row(good.name)).toBeVisible()
  expect(await overflowing(page)).toEqual([])
  await row(good.name).getByRole('button', { name: 'Одобрить' }).click()
  await expect(page.getByText('Турнир одобрен и опубликован').first()).toBeVisible()
  await row(bad.name).getByRole('button', { name: 'Отклонить' }).click()
  await page.locator('#reject-reason').fill('Нет даты и места проведения')
  await page.getByRole('dialog').getByRole('button', { name: 'Отклонить' }).click()
  await expect(page.getByText(/Турнир отклонён/).first()).toBeVisible()
  const list = (await (await admin())('GET', '/admin/tournaments')).data
  const of = (id: string) => (list.items ?? list).find((x: { id: string }) => x.id === id)
  expect([of(good.id).moderation, of(bad.id).moderation]).toEqual(['approved', 'rejected'])
})
