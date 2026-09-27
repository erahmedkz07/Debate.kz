import type { TFunction } from 'i18next'
import { ApiError } from '@/api'

// Turns an API error code into a translated message (falls back to a generic one)
export function errorMessage(e: unknown, t: TFunction) {
  const code = e instanceof ApiError ? e.code : 'unknown_error'
  return t(`apiErrors.${code}`, { defaultValue: t('apiErrors.default') })
}

// the same for a bare error code (e.g. one stored with a queued offline ballot)
export const apiErrorText = (code: string, t: TFunction) => t(`apiErrors.${code}`, { defaultValue: t('apiErrors.default') })
