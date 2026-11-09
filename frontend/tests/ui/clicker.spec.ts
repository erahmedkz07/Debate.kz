import { expect, test, type Page } from '@playwright/test'
import { leagueTournament, signIn } from './helpers'

// Every button and tab of the organizer's pages and of the public tournament page is pressed once (a fresh page each
// time): no script error, no failed request. Buttons that delete, finish or publish something are left out (the
// journey test runs those for real); a dialog that opens is closed with Escape.
// the clickable things of the page, outside the site's header and footer
const PICK = 'button:not(header button):not(footer button), [role="tab"], [role="radio"], [role="switch"]'
const RISKY = /удал|снять|заверш|опубликов|пересобр|сгенерир|объявить|отменить брейк|сбросить|выйти|начать турнир|вернуть регистрац|отклон|подтверд|оплат|delete|logout|google|отправить|скачать|печать|pdf|excel/i

async function pressEverything(page: Page, path: string, problems: string[]) {
  await page.goto(path)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  const labels = await page.evaluate(pick => [...document.querySelectorAll<HTMLElement>(pick)]
    .filter(el => el.offsetParent !== null && !el.closest('header, footer'))
    .map(el => ({ role: el.getAttribute('role') ?? 'button', disabled: (el as HTMLButtonElement).disabled, text: (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ') })), PICK)
  // found again by its role and name (and its place among buttons of the same name): the page may load in parts
  const seen = new Map<string, number>()
  let pressed = 0
  for (const { role, text, disabled } of labels.slice(0, 80)) {
    const k = `${role}|${text}`
    const n = seen.get(k) ?? 0
    seen.set(k, n + 1)
    if (!text || disabled || RISKY.test(text)) continue
    await page.goto(path)
    await page.waitForLoadState('networkidle').catch(() => undefined)
    const el = page.getByRole(role as 'button', { name: text, exact: true }).filter({ visible: true }).nth(n)
    if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) continue
    const before = problems.length
    await el.click({ timeout: 3000 }).catch(e => problems.push(`${path} «${text}»: not clickable (${String(e.message).split('\n')[0].slice(0, 80)})`))
    await page.waitForTimeout(250)
    await page.keyboard.press('Escape').catch(() => undefined)
    if (problems.length > before) problems[problems.length - 1] += ` ← after «${text}»`
    pressed++
  }
  return pressed
}

test('every button of the organizer\'s and the public pages can be pressed', async ({ page }) => {
  test.setTimeout(1_200_000)
  const problems: string[] = []
  page.on('pageerror', e => problems.push(`script: ${e.message.slice(0, 200)}`))
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace(/^.*\/api/, '/api')}`) })
  const t = await leagueTournament()
  await signIn(page, t.org.email, t.org.password)
  let total = 0
  for (const s of ['', '/teams', '/judges', '/schedule', '/rounds', '/draw', '/ballots', '/results', '/settings', '/settings?part=place', '/settings?part=conduct', '/settings?part=access'])
    total += await pressEverything(page, `/dashboard/tournaments/${t.id}${s}`, problems)
  total += await pressEverything(page, `/tournaments/${t.id}`, problems)
  total += await pressEverything(page, '/me', problems)
  console.log(`\n[clicker] pressed ${total} buttons; ${problems.length} problem(s)\n${problems.join('\n')}`)
  expect(problems, problems.join('\n')).toEqual([])
})
