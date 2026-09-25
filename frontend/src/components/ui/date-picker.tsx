import { useMemo, useState } from 'react'
import * as P from '@radix-ui/react-popover'
import { useTranslation } from 'react-i18next'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Brand-styled date picker (the browser's native calendar popup cannot be styled).
// Works with ISO "YYYY-MM-DD" strings, like the API.

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

interface Props {
  value?: string
  onChange: (value: string) => void
  min?: string
  max?: string
  id?: string
  invalid?: boolean
  placeholder?: string
  className?: string
}

export function DatePicker({ value, onChange, min, max, id, invalid, placeholder, className }: Props) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'kz' ? 'kk-KZ' : 'ru-RU'
  const [open, setOpen] = useState(false)
  const todayIso = toIso(new Date())
  // month shown in the popup: the selected date, else the min date, else today
  const [view, setView] = useState(() => fromIso(value || min || todayIso))

  const rawMonth = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(view)
  // only the first letter is upper-cased (CSS capitalize would also turn 'г.' into 'Г.')
  const monthLabel = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1)
  // weekday names starting from Monday (2024-01-01 was a Monday)
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 1 + i))),
    [locale],
  )

  // 6 weeks grid, Monday first
  const days = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1)
    const offset = (first.getDay() + 6) % 7
    return Array.from({ length: 42 }, (_, i) => new Date(view.getFullYear(), view.getMonth(), 1 - offset + i))
  }, [view])

  const disabled = (iso: string) => (!!min && iso < min) || (!!max && iso > max)
  const pick = (iso: string) => {
    if (disabled(iso)) return
    onChange(iso)
    setOpen(false)
  }
  const shift = (months: number) => setView(v => new Date(v.getFullYear(), v.getMonth() + months, 1))
  const label = value
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(fromIso(value))
    : placeholder ?? t('datePicker.placeholder')

  return (
    <P.Root open={open} onOpenChange={o => { setOpen(o); if (o) setView(fromIso(value || min || todayIso)) }}>
      <P.Trigger asChild>
        <button
          type="button" id={id} aria-invalid={invalid}
          className={cn(
            'flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl border-2 border-border bg-card px-3.5 text-left text-sm transition-colors',
            'hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 data-[state=open]:border-primary data-[state=open]:ring-4 data-[state=open]:ring-primary/15',
            'aria-[invalid=true]:border-danger',
            !value && 'text-muted-foreground/70',
            className,
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-primary" />
          <span className="flex-1 truncate">{label}</span>
        </button>
      </P.Trigger>
      <P.Portal>
        <P.Content align="start" sideOffset={6} collisionPadding={12}
          className="z-[60] w-[19rem] rounded-2xl border border-border bg-card p-3 text-foreground shadow-xl shadow-navy/10 data-[state=open]:animate-[dropdown-in_150ms_ease-out]">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => shift(-1)} aria-label={t('datePicker.prev')}
              className="grid size-9 cursor-pointer place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
              <ChevronLeft className="size-4" />
            </button>
            <p className="text-sm font-bold">{monthLabel}</p>
            <button type="button" onClick={() => shift(1)} aria-label={t('datePicker.next')}
              className="grid size-9 cursor-pointer place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdays.map(w => <span key={w} className="py-1 text-[11px] font-semibold uppercase text-muted-foreground">{w}</span>)}
            {days.map(d => {
              const iso = toIso(d)
              const outside = d.getMonth() !== view.getMonth()
              const selected = iso === value
              const isToday = iso === todayIso
              const off = disabled(iso)
              return (
                <button key={iso} type="button" disabled={off} onClick={() => pick(iso)} aria-pressed={selected}
                  aria-label={new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(d)}
                  className={cn(
                    'grid h-9 cursor-pointer place-items-center rounded-xl text-sm tabular-nums transition-colors',
                    selected ? 'bg-primary font-bold text-primary-foreground shadow-md shadow-primary/25'
                      : off ? 'cursor-not-allowed text-muted-foreground/30'
                        : outside ? 'text-muted-foreground/50 hover:bg-muted'
                          : 'hover:bg-primary-soft hover:text-primary',
                    isToday && !selected && 'font-bold text-primary ring-2 ring-inset ring-primary/40',
                  )}>
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <button type="button" onClick={() => { onChange(''); setOpen(false) }}
              className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-3.5" />{t('datePicker.clear')}
            </button>
            <button type="button" disabled={disabled(todayIso)} onClick={() => pick(todayIso)}
              className="cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40">
              {t('datePicker.today')}
            </button>
          </div>
        </P.Content>
      </P.Portal>
    </P.Root>
  )
}
