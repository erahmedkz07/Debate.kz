import { createHmac } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { newAccount, signIn } from './helpers'

// the code an authenticator app shows for this secret (RFC 6238)
function totp(secret: string, step = Math.floor(Date.now() / 30_000)) {
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, value = 0
  const bytes: number[] = []
  for (const ch of secret.replace(/\s/g, '')) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8 } }
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step))
  const h = createHmac('sha1', Buffer.from(bytes)).update(counter).digest()
  const o = h[h.length - 1] & 15
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, '0')
}

test('two-step sign-in: turned on in the profile, then asked for at sign-in', async ({ page }) => {
  const acc = await newAccount('UI Двухфакторный')
  await signIn(page, acc.email, acc.password)
  await page.goto('/me?tab=settings')
  await page.getByRole('button', { name: 'Включить' }).first().click()
  const dialog = page.getByRole('dialog')
  // the secret under the QR code, as the app would read it
  const secret = (await dialog.locator('button.font-mono').innerText()).replace(/\s/g, '')
  await dialog.getByLabel('Код из приложения').fill(totp(secret))
  await dialog.getByRole('button', { name: 'Включить' }).click()
  await expect(page.getByText('Коды восстановления')).toBeVisible()
  await expect(page.getByRole('dialog').locator('li')).toHaveCount(8)
  await page.getByRole('button', { name: 'Я сохранил' }).click()
  await expect(page.getByText('Включён: при входе нужен код из приложения')).toBeVisible()

  // sign out and in: the password, then the code
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }))
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(acc.email)
  await page.getByLabel(/пароль/i).first().fill(acc.password)
  await page.getByRole('button', { name: /^войти$/i }).click()
  await expect(page.getByRole('heading', { name: 'Подтвердите вход' })).toBeVisible()
  await page.getByLabel('Код из приложения или код восстановления').fill(totp(secret, Math.floor(Date.now() / 30_000) + 1))
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).not.toHaveURL(/\/login/)
})
