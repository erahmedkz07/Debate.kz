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
