import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import i18n from './i18n'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const locale = () => (i18n.language === 'kz' ? 'kk-KZ' : 'ru-RU')

// Kazakh dates are written by hand: many browsers ship without Kazakh calendar data and print "2026 M09 27"
const KZ_MONTHS = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан']
const KZ_MONTHS_SHORT = ['қаң.', 'ақп.', 'нау.', 'сәу.', 'мам.', 'мау.', 'шіл.', 'там.', 'қыр.', 'қаз.', 'қар.', 'жел.']
const KZ_WEEKDAYS = ['жексенбі', 'дүйсенбі', 'сейсенбі', 'сәрсенбі', 'бейсенбі', 'жұма', 'сенбі']
const KZ_WEEKDAYS_SHORT = ['жс', 'дс', 'сс', 'ср', 'бс', 'жм', 'сб']
const pad = (n: number) => String(n).padStart(2, '0')

function formatKz(d: Date, o: Intl.DateTimeFormatOptions) {
  if (o.day === undefined && o.month === undefined && o.year === undefined && o.weekday) {
    return o.weekday === 'long' ? KZ_WEEKDAYS[d.getDay()] : KZ_WEEKDAYS_SHORT[d.getDay()]
  }
  const month = o.month === 'long' ? KZ_MONTHS[d.getMonth()] : o.month === 'short' ? KZ_MONTHS_SHORT[d.getMonth()] : o.month ? pad(d.getMonth() + 1) : ''
  const date = o.month === 'numeric' || o.month === '2-digit'
    ? [o.day && pad(d.getDate()), month, o.year && d.getFullYear()].filter(Boolean).join('.')
    : [o.day && d.getDate(), month, o.year && `${d.getFullYear()} ж.`].filter(Boolean).join(' ')
  const weekday = o.weekday ? `${o.weekday === 'long' ? KZ_WEEKDAYS[d.getDay()] : KZ_WEEKDAYS_SHORT[d.getDay()]}, ` : ''
  const time = o.hour ? `, ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''
  return weekday + date + time
}

// one place for every date on the site, in the current language
export function formatDateObj(d: Date, opts: Intl.DateTimeFormatOptions) {
  return i18n.language === 'kz' ? formatKz(d, opts) : new Intl.DateTimeFormat('ru-RU', opts).format(d)
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) {
  return formatDateObj(new Date(iso.slice(0, 10) + 'T00:00:00'), opts)
}

// full ISO timestamps (with time), e.g. the admin audit log
export function formatDateTime(iso: string) {
  return formatDateObj(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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
