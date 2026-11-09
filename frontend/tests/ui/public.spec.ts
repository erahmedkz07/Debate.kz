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
    await page.getByRole('tab', { name: /Рейтинг команд/ }).click()
    await expect(page).toHaveURL(/tab=results/)
    await page.getByRole('tab', { name: /Судьи/ }).click()
    await expect(page).toHaveURL(/tab=judges/)
    await page.goBack()
    await expect(page.getByRole('tab', { name: /Рейтинг команд/ })).toHaveAttribute('data-state', 'active')
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

// the score calculator types like a ballot: a wrong key is not taken, a finished score moves on, an Enter out of habit
// after an automatic move does not skip a speaker
for (const [format, values, total] of [
  ['wsdc', ['75', '75', '75', '38', '70', '70', '70', '35'], ['263', '245']],
  ['bp', ['75', '74', '70', '71', '80', '79', '60', '61'], ['149', '141', '159', '121']],
] as const) {
  test(`the score calculator: typing with the keyboard (${format})`, async ({ page }) => {
    await page.goto(`/calculator?format=${format}`)
    const fields = page.locator('input[data-score]')
    await expect(fields).toHaveCount(values.length)
    await fields.first().click()
    await page.keyboard.type('2') // no score starts with 2 (WSDC 60–80, BP 50–100)
    await expect(fields.first()).toHaveValue('')
    for (const v of values) { await page.keyboard.type(v); await page.keyboard.press('Enter') }
    expect(await fields.evaluateAll(els => els.map(e => (e as HTMLInputElement).value))).toEqual([...values])
    for (const x of total) await expect(page.getByText(x, { exact: true }).first()).toBeVisible()
    await expect(page.getByText(format === 'bp' ? /3 балл/ : /Побеждает:/).first()).toBeVisible()
  })
}

// the break calculator: a number is erased and typed again the way people do it on a phone
test('the break calculator: the number of teams is erased and typed again', async ({ page }) => {
  await page.goto('/break-calculator?teams=16')
  const teams = page.locator('#bc-teams')
  await teams.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('24')
  await expect(teams).toHaveValue('24')
  await expect(page).toHaveURL(/teams=24/)
  // a number out of range is not taken; leaving the field brings the last good one back
  await teams.fill('2')
  await teams.blur()
  await expect(teams).toHaveValue('24')
})

test('the timer: the preparation minutes are erased and typed again', async ({ page }) => {
  await page.goto('/timer')
  await page.getByRole('button', { name: 'Подготовка' }).click()
  const minutes = page.getByRole('textbox', { name: 'Своё время подготовки' })
  await minutes.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('20')
  await minutes.blur()
  await expect(minutes).toHaveValue('20')
  await expect(page.getByText('20:00').first()).toBeVisible()
})

// the timer: a reset or the next speaker while the time runs starts the next speech from zero; a pause keeps the time
test('the timer: reset and next speaker start from zero, a pause keeps the time', async ({ page }) => {
  await page.clock.install()
  await page.goto('/timer')
  const shown = () => page.locator('body').innerText().then(x => x.match(/\b\d{1,2}:\d{2}\b/)?.[0])
  const start = page.getByRole('button', { name: 'Старт' })
  await start.click()
  await page.clock.runFor(5000)
  expect(await shown()).toBe('0:05')
  await page.getByRole('button', { name: 'Сбросить' }).click()
  await start.click()
  await page.clock.runFor(1000)
  expect(await shown()).toBe('0:01')
  await page.clock.runFor(4000)
  await page.getByRole('button', { name: 'Следующий спикер' }).click()
  await start.click()
  await page.clock.runFor(2000)
  expect(await shown()).toBe('0:02')
  await page.getByRole('button', { name: 'Пауза' }).click()
  await page.clock.runFor(10_000)
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await page.clock.runFor(1000)
  expect(await shown()).toBe('0:03')
})

// the site was updated while the tab stayed open: the next page's part is gone; the page reloads into the new version
// by itself instead of showing the crash screen
test('a part of the site missing after an update: the page reloads by itself', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/tools')
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => { (window as unknown as { oldTab: boolean }).oldTab = true })
  let gone = true
  await page.route(/\/src\/pages\/Calculator\.tsx/, r => (gone ? (gone = false, r.fulfill({ status: 404, body: '' })) : r.continue()))
  await page.locator('a[href="/calculator"]').first().click()
  await expect(page.locator('input[data-score]').first()).toBeVisible()
  await expect(page).toHaveURL(/\/calculator/)
  expect(await page.evaluate(() => (window as unknown as { oldTab?: boolean }).oldTab)).toBeUndefined() // it was reloaded
  await expect(page.getByText('Что-то пошло не так')).toHaveCount(0)
})
