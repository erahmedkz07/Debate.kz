import { expect, test } from '@playwright/test'
import { leagueTournament, overflowing } from './helpers'

// a phone: every main page fits the screen width and scrolls to its very end
const pages = ['/', '/tournaments', '/rating', '/clubs', '/tools', '/motions', '/pricing', '/timer', '/login', '/register']

for (const path of pages) {
  test(`phone: ${path} fits the screen and scrolls to its end`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    expect(await overflowing(page)).toEqual([])
    // the very end of the page can be reached (and the footer is on screen where the page has one)
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
    const end = await page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2)
    expect(end).toBe(true)
    if (await page.locator('footer').count()) await expect(page.locator('footer').first()).toBeInViewport()
  })
}

test('phone: a tournament page and its tabs fit the screen', async ({ page }) => {
  const t = await leagueTournament()
  for (const tab of ['overview', 'teams', 'draw', 'results', 'judges']) {
    await page.goto(`/tournaments/${t.id}?tab=${tab}`)
    await page.waitForLoadState('networkidle')
    expect(await overflowing(page), tab).toEqual([])
  }
})

test('phone: a judge types the whole ballot with the keyboard, each next field is in view and not under the bars', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 }) // a phone with the on-screen keyboard open
  const t = await leagueTournament()
  const room = t.details.debates.find((d: { judgeIds: string[] }) => d.judgeIds.length)
  const judge = t.details.judges.find((j: { id: string }) => j.id === room.judgeIds[0])
  await page.goto(`/j/${judge.accessKey}/ballot/${room.id}`)
  const fields = page.locator('input[data-score]')
  await expect(fields).toHaveCount(8)
  await fields.first().click()
  const covered: string[] = []
  for (const [i, v] of ['75', '75', '75', '38', '70', '70', '70', '35'].entries()) {
    await page.keyboard.type(v)
    await page.keyboard.press('Enter')
    if (i === 7) break
    // the field that has the focus now is the one under its own centre (nothing sticky lies over it) once the
    // page has scrolled (the site scrolls smoothly)
    const free = () => page.evaluate(() => {
      const el = document.activeElement as HTMLElement
      const r = el.getBoundingClientRect()
      return el.hasAttribute('data-score') && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el
    })
    let ok = false
    for (let k = 0; k < 15 && !ok; k++) { ok = await free(); if (!ok) await page.waitForTimeout(100) }
    if (!ok) covered.push(`after field ${i + 1}`)
  }
  expect(covered).toEqual([])
  expect(await fields.evaluateAll(els => els.map(e => (e as HTMLInputElement).value))).toEqual(['75', '75', '75', '38', '70', '70', '70', '35'])
})
