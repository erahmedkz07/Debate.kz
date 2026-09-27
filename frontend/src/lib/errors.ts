import type { TFunction } from 'i18next'
import { ApiError } from '@/api'

// Turns an API error code into a translated message (falls back to a generic one).
// The server's details (e.g. { need: 2, have: 1 } for missing judges) are passed into the text.
export function errorMessage(e: unknown, t: TFunction) {
  const code = e instanceof ApiError ? e.code : 'unknown_error'
  const details = e instanceof ApiError && e.details && typeof e.details === 'object' ? e.details as Record<string, unknown> : {}
  return t(`apiErrors.${code}`, { defaultValue: t('apiErrors.default'), ...details })
}

// the same for a bare error code (e.g. one stored with a queued offline ballot)
export const apiErrorText = (code: string, t: TFunction) => t(`apiErrors.${code}`, { defaultValue: t('apiErrors.default') })
