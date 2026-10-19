import { expect, test } from '@playwright/test'
import { leagueTournament, newAccount, signIn } from './helpers'

test('schedule: the time wheel turns endlessly (after 23 come 00 and 01)', async ({ page }) => {
  const t = await leagueTournament()
  await signIn(page, t.org.email, t.org.password)
  await page.goto(`/dashboard/tournaments/${t.id}/schedule`)
  await page.getByRole('button', { name: 'Добавить пункт' }).click()
  const time = page.locator('button').filter({ hasText: /^(\d\d:\d\d|--:--)$/ }).last()
  await time.click()
  const [hours, minutes] = [page.getByRole('listbox').nth(0), page.getByRole('listbox').nth(1)]
  await expect(hours.getByRole('option', { selected: true })).toHaveText(/\d\d/)
  // to 23, then one row further: the next one is 00 of the next turn, not an end
  await hours.evaluate(el => { el.scrollTop = (3 * 24 + 23) * 36 })
  await expect(time).toHaveText(/^23:/)
  await hours.evaluate(el => { el.scrollTop = (3 * 24 + 24) * 36 })
  await expect(time).toHaveText(/^00:/)
  await minutes.evaluate(el => { el.scrollTop = (3 * 12 + 11) * 36 })
  await expect(time).toHaveText(/:55$/)
  await minutes.evaluate(el => { el.scrollTop = (3 * 12 + 12) * 36 })
  await expect(time).toHaveText(/:00$/)
})

test('draw: the league under both teams of a room; Kazakh league first', async ({ page }) => {
  const t = await leagueTournament()
  await signIn(page, t.org.email, t.org.password)
  await page.goto(`/dashboard/tournaments/${t.id}/draw`)
  const row = page.locator('tbody tr').filter({ hasText: 'Қаз' }).filter({ has: page.locator('select, button') }).first()
  await expect(row.getByText('Қазақ лигасы')).toHaveCount(2)
  const tabs = page.getByRole('group', { name: /лиги|лигалар/i }).first().getByRole('button')
  await expect(tabs.nth(1)).toHaveText('Қазақ лигасы')
})

test('speakers\' QR cards: one card per speaker, by league', async ({ page }) => {
  const t = await leagueTournament()
  await signIn(page, t.org.email, t.org.password)
  await page.goto(`/tournaments/${t.id}/speaker-links/print`)
  const cards = page.getByText('Отсканируйте: жеребьёвка, баллы и сертификат')
  await expect(cards).toHaveCount(24)
  await page.getByRole('button', { name: 'Қазақ лигасы' }).click()
  await expect(cards).toHaveCount(12)
})

test('a speaker by the link: the room without signing in, then "this is me"', async ({ page }) => {
  const t = await leagueTournament()
  const links = (await t.org('POST', `/tournaments/${t.id}/speaker-links`)).data
  const team = links[0]
  const key = team.speakers[0].accessKey
  await page.goto(`/s/${key}`)
  await expect(page.getByRole('heading', { name: team.speakers[0].name })).toBeVisible()
  await expect(page.getByText('Мои дебаты')).toBeVisible()
  await expect(page.getByText(/^Против:/)).toBeVisible()
  // not signed in: the button leads to sign-in and back here
  await page.getByRole('button', { name: 'Войти и сохранить в профиль' }).click()
  await expect(page).toHaveURL(/\/login\?next=%2Fs%2F/)
  const student = await newAccount('UI Спикер')
  await signIn(page, student.email, student.password)
  await page.goto(`/s/${key}`)
  await page.getByRole('button', { name: 'Это я — сохранить в мой профиль' }).click()
  await expect(page.getByText(/уже сохранены в профиль/)).toBeVisible()
})
