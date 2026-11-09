import { expect, test, type Page } from '@playwright/test'
import { leagueTournament, signIn } from './helpers'

// fills a two-team ballot: the proposition 75 per speech and 37 for the reply, the opposition 70 and 35
async function fillBallot(page: Page, propName: string) {
  const inputs = page.locator('input[inputmode="decimal"]')
  await expect(inputs).toHaveCount(8)
  const values = ['75', '75', '75', '37', '70', '70', '70', '35']
  for (const [i, v] of values.entries()) await inputs.nth(i).fill(v)
  await page.locator('button[aria-pressed]').filter({ hasText: propName }).last().click()
}
async function send(page: Page) {
  await page.getByRole('button', { name: 'Отправить бюллетень' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Да, отправить' }).click()
  await expect(page.getByText('Бюллетень принят')).toBeVisible()
}

test('a judge by the personal link: the ballot is sent with a reason (no flow: judges keep notes on paper)', async ({ page }) => {
  const t = await leagueTournament()
  const room = t.details.debates.find((d: { judgeIds: string[] }) => d.judgeIds.length)
  const judge = t.details.judges.find((j: { id: string }) => j.id === room.judgeIds[0])
  const prop = t.details.teams.find((x: { id: string }) => x.id === room.propositionTeamId).name
  await page.goto(`/j/${judge.accessKey}`)
  await expect(page.getByRole('heading', { name: judge.name })).toBeVisible()
  await page.goto(`/j/${judge.accessKey}/ballot/${room.id}`)
  await expect(page.getByText('Флоу — мои записи по речам')).toHaveCount(0)

  await fillBallot(page, prop)
  await page.locator('#reason').fill('Правительство лучше доказало вред')
  await send(page)
})

test('reply speeches turned off in the settings: the ballot has only the speeches', async ({ page }) => {
  const t = await leagueTournament()
  await signIn(page, t.org.email, t.org.password)
  await page.goto(`/dashboard/tournaments/${t.id}/settings?part=conduct`)
  const toggle = page.getByRole('switch', { name: 'Проводим ответные речи' })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')

  const room = t.details.debates.find((d: { judgeIds: string[] }) => d.judgeIds.length)
  const judge = t.details.judges.find((j: { id: string }) => j.id === room.judgeIds[0])
  const prop = t.details.teams.find((x: { id: string }) => x.id === room.propositionTeamId).name
  await page.goto(`/j/${judge.accessKey}/ballot/${room.id}`)
  const inputs = page.locator('input[inputmode="decimal"]')
  await expect(inputs).toHaveCount(6)
  await expect(page.getByText('Ответная речь')).toHaveCount(0)
  for (const [i, v] of ['75', '75', '75', '70', '70', '70'].entries()) await inputs.nth(i).fill(v)
  await page.locator('button[aria-pressed]').filter({ hasText: prop }).last().click()
  await send(page)

  // after the first ballot the setting is fixed
  await page.goto(`/dashboard/tournaments/${t.id}/settings?part=conduct`)
  await expect(page.getByText('Без ответных речей')).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Проводим ответные речи' })).toHaveCount(0)
})

test('the organizer enters a panel\'s ballots one after another: each judge gets an empty form', async ({ page }) => {
  const t = await leagueTournament()
  const room = t.details.debates.find((d: { judgeIds: string[] }) => d.judgeIds.length)
  const wing = t.details.judges.find((j: { id: string }) => !t.details.debates.some((d: { roundId: string; judgeIds: string[] }) => d.roundId === room.roundId && d.judgeIds.includes(j.id)))
  // a second judge on the panel (a free one, or else moved from another room)
  const second = wing ?? t.details.judges.find((j: { id: string }) => j.id !== room.judgeIds[0])
  await t.org('PATCH', `/debates/${room.id}`, { wingJudgeIds: [second.id] })
  const prop = t.details.teams.find((x: { id: string }) => x.id === room.propositionTeamId).name
  await signIn(page, t.org.email, t.org.password)

  await page.goto(`/ballot/${room.id}`)
  const enter = page.getByRole('link', { name: /Внести за судью|Исправить/ })
  await expect(enter).toHaveCount(2)
  await enter.first().click()
  await fillBallot(page, prop)
  await send(page)
  await page.getByRole('button', { name: 'Вернуться' }).click()
  // back on the panel: the second judge's ballot opens as an empty form, not the first one's "accepted" screen
  await page.getByRole('link', { name: 'Внести за судью' }).first().click()
  await expect(page.getByRole('button', { name: 'Отправить бюллетень' })).toBeVisible()
  await expect(page.getByText('Бюллетень принят')).toHaveCount(0)
})

test('score ranges in the settings: 50–80, and the ballot follows them', async ({ page }) => {
  const t = await leagueTournament()
  await signIn(page, t.org.email, t.org.password)
  await page.goto(`/dashboard/tournaments/${t.id}/settings?part=conduct`)
  await page.locator('#sc-speakerMin').fill('50')
  // the only enabled "Save": the card with a change
  await page.locator('button:enabled', { hasText: 'Сохранить' }).click()
  await expect(page.getByText('Сохранено', { exact: true }).first()).toBeVisible()
  expect((await t.org('GET', `/tournaments/${t.id}`)).data.scoring.speakerMin).toBe(50)
  const room = t.details.debates.find((d: { judgeIds: string[] }) => d.judgeIds.length)
  const judge = t.details.judges.find((j: { id: string }) => j.id === room.judgeIds[0])
  await page.goto(`/j/${judge.accessKey}/ballot/${room.id}`)
  await expect(page.locator('input[inputmode="decimal"]').first()).toHaveAttribute('placeholder', '50–80')
})

test('typing scores: a slip never lands on the sheet, and a finished score moves on to the next speaker', async ({ page }) => {
  const t = await leagueTournament()
  const room = t.details.debates.find((d: { judgeIds: string[] }) => d.judgeIds.length)
  const judge = t.details.judges.find((j: { id: string }) => j.id === room.judgeIds[0])
  await page.goto(`/j/${judge.accessKey}/ballot/${room.id}`)
  const inputs = page.locator('input[data-score]')
  await inputs.first().click()
  // 60–80 by 0.5: "9" cannot start a score; a third digit after "75" is ignored
  await page.keyboard.type('9')
  await expect(inputs.nth(0)).toHaveValue('')
  await page.keyboard.type('755')
  await expect(inputs.nth(0)).toHaveValue('75')
  // "75" could still become "75.5": after a short pause the next speaker's field takes the keys
  await expect(inputs.nth(1)).toBeFocused({ timeout: 3000 })
  // "80" cannot get longer: the next field at once; a comma is a point
  await page.keyboard.type('80')
  await expect(inputs.nth(1)).toHaveValue('80')
  await expect(inputs.nth(2)).toBeFocused()
  await page.keyboard.type('72,5')
  await expect(inputs.nth(2)).toHaveValue('72.5')
  await expect(inputs.nth(3)).toBeFocused()
  // Enter moves on too
  await page.keyboard.type('35')
  await page.keyboard.press('Enter')
  await expect(inputs.nth(4)).toBeFocused()
})

test('BP: a team that did not come is 4th; the chair scores and places the other three', async ({ page }) => {
  const { newAccount, admin } = await import('./helpers')
  const org = await newAccount('UI BP Организатор')
  const t = (await org.c('POST', '/tournaments', { name: `UI BP ${Math.random().toString(36).slice(2, 7)}`, city: 'Астана', startDate: '2026-12-20', endDate: '2026-12-20', level: 'university', description: '', preliminaryRounds: 1, breakSize: 4, maxTeams: 12, registrationOpen: true, requireApproval: true, languages: ['ru'], format: 'BP' })).data
  await (await admin())('PATCH', `/admin/tournaments/${t.id}`, { moderation: 'approved' })
  await org.c('POST', `/tournaments/${t.id}/teams/bulk`, { names: ['BP Один', 'BP Два', 'BP Три', 'BP Четыре'] })
  await org.c('POST', `/tournaments/${t.id}/judges/bulk`, { names: ['BP Судья'] })
  await org.c('PATCH', `/tournaments/${t.id}`, { status: 'ongoing' })
  let d = (await org.c('GET', `/tournaments/${t.id}`)).data
  await org.c('POST', `/rounds/${d.rounds[0].id}/draw`, { addSwing: false })
  await org.c('PATCH', `/rounds/${d.rounds[0].id}`, { motion: 'ЭП', status: 'released' })
  d = (await org.c('GET', `/tournaments/${t.id}`)).data
  const room = d.debates[0]
  const absentName = d.teams.find((x: { id: string }) => x.id === room.closingOppositionTeamId).name
  // the organizer marks the team that did not come
  const { signIn } = await import('./helpers')
  await signIn(page, org.email, org.password)
  await page.goto(`/dashboard/tournaments/${t.id}/ballots`)
  await page.getByRole('button', { name: 'Техническое поражение' }).filter({ visible: true }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(absentName) }).click()
  await expect.poll(async () => (await org.c('GET', `/tournaments/${t.id}`)).data.debates[0].forfeit).toBe('closingOpposition')
  // the chair: three teams to score, the absent one named
  const judge = d.judges.find((j: { id: string }) => j.id === room.judgeIds[0])
  await page.goto(`/j/${judge.accessKey}/ballot/${room.id}`)
  await expect(page.getByText(`«${absentName}»`)).toBeVisible()
  const inputs = page.locator('input[data-score]')
  await expect(inputs).toHaveCount(6)
  for (const [i, v] of ['80', '80', '75', '75', '70', '70'].entries()) await inputs.nth(i).fill(v)
  await page.getByRole('button', { name: 'Отправить бюллетень' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Да, отправить' }).click()
  await expect(page.getByText('Бюллетень принят')).toBeVisible()
  const after = (await org.c('GET', `/tournaments/${t.id}`)).data.debates[0]
  expect(after.ranking.at(-1)).toBe('closingOpposition')
})
