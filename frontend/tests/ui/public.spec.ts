import { expect, test } from '@playwright/test'
import { leagueTournament, newAccount } from './helpers'

test('home: the pricing shows the real free limit (≤ 30 / 31+)', async ({ page }) => {
  await page.goto('/')
  const pricing = page.getByText('≤ 30')
  await pricing.scrollIntoViewIfNeeded()
  await expect(pricing).toBeVisible()
  await expect(page.getByText('31+')).toBeVisible()
})

test('language switch reads ҚАЗ | РУС and changes the language', async ({ page }) => {
  await page.goto('/')
  const sw = page.getByRole('group', { name: /язык|тіл/i }).first()
  await expect(sw.getByRole('button').first()).toHaveText(/Қаз/i)
  await sw.getByRole('button', { name: /Қаз/i }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk')
  await sw.getByRole('button', { name: /Рус/i }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
})

test('sign in with email and password; a wrong password is refused', async ({ page }) => {
  const acc = await newAccount('UI Вход')
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(acc.email)
  await page.getByLabel(/пароль/i).first().fill('wrong-password-1')
  await page.getByRole('button', { name: /^войти$/i }).click()
  await expect(page.getByText(/неверн/i).first()).toBeVisible()
  await page.getByLabel(/пароль/i).first().fill(acc.password)
  await page.getByRole('button', { name: /^войти$/i }).click()
  await expect(page).not.toHaveURL(/\/login/)
})

test.describe('a tournament page', () => {
  test('opens on Overview, tabs go back step by step, Kazakh league first', async ({ page }) => {
    const t = await leagueTournament()
    await page.goto(`/tournaments/${t.id}`)
    await expect(page.getByRole('tab', { name: 'Обзор' })).toHaveAttribute('data-state', 'active')
    await page.getByRole('tab', { name: /Результаты/ }).click()
    await expect(page).toHaveURL(/tab=results/)
    await page.getByRole('tab', { name: /Судьи/ }).click()
    await expect(page).toHaveURL(/tab=judges/)
    await page.goBack()
    await expect(page.getByRole('tab', { name: /Результаты/ })).toHaveAttribute('data-state', 'active')
    await page.goBack()
    await expect(page.getByRole('tab', { name: 'Обзор' })).toHaveAttribute('data-state', 'active')
    // the leagues: Kazakh first, whatever order the organizer typed them in
    await page.getByRole('tab', { name: /Команды/ }).click()
    const leagues = page.getByRole('group', { name: /лиги|лигалар/i }).first().getByRole('button')
    await expect(leagues.nth(1)).toHaveText('Қазақ лигасы')
    await expect(leagues.nth(2)).toHaveText('Русская лига')
  })

  test('overview lists each league\'s motion of a round', async ({ page }) => {
    const t = await leagueTournament()
    await page.goto(`/tournaments/${t.id}`)
    await expect(page.getByText('БП мектепте телефонға тыйым салады')).toBeVisible()
    await expect(page.getByText('ЭП запретит телефоны в школах')).toBeVisible()
  })

  test('judges tab: rooms judged instead of a badge on everyone', async ({ page }) => {
    const t = await leagueTournament()
    await page.goto(`/tournaments/${t.id}?tab=judges`)
    await expect(page.getByText(/1 раунд/).first()).toBeVisible()
    await expect(page.getByText(/председатель: \d/).first()).toBeVisible()
  })
})
