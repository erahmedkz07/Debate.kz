import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import i18n from './i18n'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const locale = () => (i18n.language === 'kz' ? 'kk-KZ' : 'ru-RU')

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat(locale(), opts).format(new Date(iso + 'T00:00:00'))
}

// full ISO timestamps (with time), e.g. the admin audit log
export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

export function formatDateRange(start: string, end: string) {
  if (start === end) return formatDate(start, { day: 'numeric', month: 'long', year: 'numeric' })
  const s = new Date(start), e = new Date(end)
  if (s.getMonth() === e.getMonth()) {
    return `${s.getDate()}–${formatDate(end, { day: 'numeric', month: 'long', year: 'numeric' })}`
  }
  return `${formatDate(start)} – ${formatDate(end, { day: 'numeric', month: 'long', year: 'numeric' })}`
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat(locale()).format(n)
}

// first letters of the first two words; signs like № or « are skipped ("Гимназия №1" -> "Г1")
export const initials = (name: string) => (name.match(/[\p{L}\p{N}]+/gu) ?? [name]).map(p => p[0]).slice(0, 2).join('').toUpperCase()
