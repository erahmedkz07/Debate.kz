import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { User } from '../generated/prisma/client.js'
import { env } from '../lib/env.js'
import { COOKIE, sessionToken } from '../middleware/auth.js'
import type { Lang } from './botTexts.js'

// The bot acts for a person through the site's own API, with a short session of that person: an application,
// joining a club, check-in go through exactly the same checks, locks and notifications as on the site.
export async function asUser<T = Record<string, unknown>>(user: Pick<User, 'id'>, method: string, apiPath: string, body?: unknown) {
  const res = await fetch(`http://127.0.0.1:${env.PORT}/api${apiPath}`, {
    method,
    headers: { cookie: `${COOKIE}=${sessionToken(user.id, '5m')}`, ...(body !== undefined && { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  return { ok: res.ok, status: res.status, data, error: res.ok ? undefined : data?.error ?? 'unknown_error' }
}

// the site's own explanations of the API's error codes (frontend/src/locales), so the bot says the same words
const explanations: Record<Lang, Record<string, string>> = { ru: {}, kz: {} }
for (const l of ['ru', 'kz'] as const) {
  try {
    const file = path.resolve(import.meta.dirname, '../../../frontend/src/locales', `${l}.json`)
    explanations[l] = JSON.parse(readFileSync(file, 'utf8')).apiErrors ?? {}
  } catch { /* the site's texts are not next to the API: the bot falls back to its general message */ }
}
export const explain = (l: Lang, code: string | undefined, fallback: string) => (code && explanations[l][code]?.replace(/\{\{\w+\}\}/g, '').trim()) || fallback
