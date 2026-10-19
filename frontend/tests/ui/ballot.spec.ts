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

test('a judge by the personal link: the flow is saved, the ballot is sent with a reason', async ({ page }) => {
  const t = await leagueTournament()
  const room = t.details.debates.find((d: { judgeIds: string[] }) => d.judgeIds.length)
  const judge = t.details.judges.find((j: { id: string }) => j.id === room.judgeIds[0])
  const prop = t.details.teams.find((x: { id: string }) => x.id === room.propositionTeamId).name
  await page.goto(`/j/${judge.accessKey}`)
  await expect(page.getByRole('heading', { name: judge.name })).toBeVisible()
  await page.goto(`/j/${judge.accessKey}/ballot/${room.id}`)

  // the flow: a note in the first speech, saved by itself, there after a reload
  const note = page.getByPlaceholder('Коротко: что сказал спикер').first()
  await note.fill('Телефоны отвлекают от уроков')
  await note.press('Enter')
  await expect(page.getByText('Сохранено', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Телефоны отвлекают от уроков')).toBeVisible()

  await fillBallot(page, prop)
  await page.locator('#reason').fill('Правительство лучше доказало вред')
  await send(page)
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
