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

export const initials = (name: string) => name.split(' ').map(p => p[0]).slice(0, 2).join('')
