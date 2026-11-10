import { expect, test } from '@playwright/test'
import { API, newAccount } from './helpers'

// The test API plays Telegram: an update is posted to it, and what the bot "sent" is read from its outbox.
let update = 800000
const tg = (body: object) => fetch(`${API}/telegram/test/update`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ update_id: ++update, ...body }) })
const say = (chat: number, text: string) => tg({ message: { message_id: update, from: { id: chat }, chat: { id: chat, type: 'private' }, text } })
const tap = (chat: number, data: string) => tg({ callback_query: { id: `ui${update}`, from: { id: chat }, data, message: { message_id: 1, chat: { id: chat, type: 'private' }, text: '' } } })
const buttonsTo = async (chat: number) => ((await (await fetch(`${API}/telegram/test/outbox?chat=${chat}`)).json()) as { reply_markup?: { inline_keyboard?: { callback_data?: string }[][] } }[])
  .flatMap(m => m.reply_markup?.inline_keyboard?.flat() ?? []).map(b => b.callback_data ?? '')

test('sign in with Telegram: the button opens the bot, a tap there signs this page in', async ({ page, context }) => {
  const acc = await newAccount('UI Телеграм Кіруші')
  const chat = 6100000 + Math.floor(Math.random() * 99999)
  const link = (await acc.c('POST', '/me/telegram/link')).data.url as string
  await say(chat, `/start ${link.split('start=')[1]}`)

  await page.goto('/login')
  const popup = context.waitForEvent('page')
  await page.getByRole('button', { name: 'Войти через Telegram' }).click()
  const bot = await popup
  await expect.poll(() => bot.url()).toContain('start=login_')
  const token = new URL(bot.url()).searchParams.get('start')!
  await bot.close()
  await expect(page.getByText('Подтвердите вход в Telegram')).toBeVisible()

  await say(chat, `/start ${token}`)
  const ok = (await buttonsTo(chat)).filter(x => x.startsWith('login:ok:')).at(-1)!
  await tap(chat, ok)
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })
  expect(await page.evaluate(async () => (await (await fetch('/api/auth/me')).json()).user?.name)).toBe('UI Телеграм Кіруші')
})

test('sign in with Telegram: "it was not me" in the bot stops it, the page says so', async ({ page, context }) => {
  const acc = await newAccount('UI Телеграм Бас Тартушы')
  const chat = 6200000 + Math.floor(Math.random() * 99999)
  await say(chat, `/start ${((await acc.c('POST', '/me/telegram/link')).data.url as string).split('start=')[1]}`)
  await page.goto('/login')
  const popup = context.waitForEvent('page')
  await page.getByRole('button', { name: 'Войти через Telegram' }).click()
  const bot = await popup
  await expect.poll(() => bot.url()).toContain('start=login_')
  const token = new URL(bot.url()).searchParams.get('start')!
  await bot.close()
  await say(chat, `/start ${token}`)
  await tap(chat, (await buttonsTo(chat)).filter(x => x.startsWith('login:no:')).at(-1)!)
  await expect(page.getByText('Вход отменён в Telegram.')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('the sign-up page offers signing up in Telegram', async ({ page }) => {
  await page.goto('/register')
  await expect(page.getByRole('link', { name: 'Регистрация через Telegram' })).toHaveAttribute('href', /start=register$/)
})
