import { expect, test } from '@playwright/test'
import { admin, API, newAccount, overflowing, tag } from './helpers'

// A participant on a phone, only with the screen: signs up, confirms the email from the letter, makes a club and a
// team, and applies to an open tournament. No script error and no failed request on the way.
test('a participant on a phone: sign-up, email, club, team, application', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(`script: ${e.message}`))
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`) })

  // an open tournament, first come first served
  const host = await newAccount('UI Хозяин Открытого')
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date(Date.now() + 7 * 864e5))
  const t = (await host.c('POST', '/tournaments', { name: `UI открытый ${tag()}`, city: 'Астана', startDate: day, endDate: day, level: 'school', description: '', preliminaryRounds: 2, breakSize: 2, maxTeams: 8, registrationOpen: true, requireApproval: false, languages: ['ru'], kind: 'open' })).data
  const ad = await admin()
  await ad('PATCH', `/admin/tournaments/${t.id}`, { moderation: 'approved' })
  await host.c('PATCH', `/tournaments/${t.id}`, { selectionMode: 'first_come' })

  // sign-up
  const email = `ui.part.${tag()}@ui.test`
  const password = `ui-${tag()}${tag()}`
  await page.goto('/register')
  await page.locator('#name').fill('Айым Серікова')
  await page.locator('#email').fill(email)
  await page.locator('#phone').fill('+7 701 555 12 34')
  await page.locator('#password').fill(password)
  await page.locator('#confirm').fill(password)
  await page.locator('input[type="checkbox"]').first().check()
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click()
  await expect(page).not.toHaveURL(/\/register$/)

  // the letter's link confirms the email
  let link = ''
  await expect.poll(async () => {
    const mails = await (await fetch(`${API}/test/mail?to=${encodeURIComponent(email)}`)).json()
    link = JSON.stringify(mails).match(/\/verify-email\?token=[\w-]+/)?.[0] ?? ''
    return link
  }).not.toBe('')
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ''))
  await expect(page.getByText(/подтвержд/i).first()).toBeVisible()

  // a club and a team, from the profile
  await page.goto('/me?tab=club')
  await page.locator('#mc-name').fill(`Клуб ${tag()}`)
  await page.locator('#mc-city').click()
  await page.keyboard.type('Астана')
  await page.getByRole('option', { name: 'Астана' }).first().click()
  await page.getByRole('button', { name: 'Создать', exact: true }).click()
  await expect(page.getByText('Клуб создан').first()).toBeVisible()
  const club = await page.evaluate(async () => (await (await fetch('/api/me/club')).json()).club)
  await ad('PATCH', `/admin/clubs/${club.id}`, { status: 'approved' })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Добавить команду' })).toBeVisible()
  expect(await overflowing(page)).toEqual([])
  await page.screenshot({ path: 'test-results/participant-club.png', fullPage: true })
  await page.getByRole('button', { name: 'Добавить команду' }).click()
  await page.locator('#ct-name').fill('Ақ Сұңқар')
  await page.getByRole('dialog').getByRole('button', { name: 'Создать' }).click()
  await expect(page.getByText('Команда создана').first()).toBeVisible()

  // the application
  await page.goto(`/tournaments/${t.id}`)
  await page.getByRole('button', { name: 'Зарегистрировать команду' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('#r-team')).toHaveValue('Ақ Сұңқар')
  for (const [i, n] of ['Айым Серікова', 'Дана Нұрлан', 'Әлия Бек'].entries()) await dialog.locator(`#r-s${i + 1}`).fill(n)
  if (await dialog.locator('#r-inst').isVisible()) {
    await dialog.locator('#r-inst').click()
    await page.keyboard.type('Лицей 1')
    await page.keyboard.press('Enter')
  }
  await dialog.locator('input[type="checkbox"]').check()
  expect(await overflowing(page)).toEqual([])
  await page.screenshot({ path: 'test-results/participant-apply.png', fullPage: false })
  await dialog.getByRole('button', { name: 'Отправить заявку' }).click()
  await expect(page.getByText(/Заявка отправлена/).first()).toBeVisible()
  const regs = (await host.c('GET', `/tournaments/${t.id}/registrations`)).data
  expect(regs.map((r: { teamName: string; status: string }) => [r.teamName, r.status])).toEqual([['Ақ Сұңқар', 'confirmed']])
  expect(errors, errors.join('\n')).toEqual([])
})
