import { useEffect, useRef, useState } from 'react'
import * as P from '@radix-ui/react-popover'
import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

// Brand-styled time picker, the pair of the DatePicker (the browser's own time field cannot be styled).
// Works with "HH:MM" strings: hours 00–23 on the left, minutes in 5-minute steps on the right.

const pad = (n: number) => String(n).padStart(2, '0')
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i))
const STEP_MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5))

interface Props {
  value?: string
  onChange: (value: string) => void
  id?: string
  invalid?: boolean
  placeholder?: string
  className?: string
  'aria-label'?: string
}

export function TimePicker({ value, onChange, id, invalid, placeholder = '--:--', className, 'aria-label': ariaLabel }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [hour = '', minute = ''] = (value ?? '').split(':')
  // a time set by hand to an odd minute (09:07) stays selectable
  const minutes = minute && !STEP_MINUTES.includes(minute) ? [...STEP_MINUTES, minute].sort() : STEP_MINUTES
  const set = (h: string, m: string) => onChange(`${h}:${m}`)

  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger asChild>
        <button
          type="button" id={id} aria-invalid={invalid} aria-label={ariaLabel}
          className={cn(
            'flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl border-2 border-border bg-card px-3.5 text-left text-sm tabular-nums transition-colors',
            'hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 data-[state=open]:border-primary data-[state=open]:ring-4 data-[state=open]:ring-primary/15',
            'aria-[invalid=true]:border-danger',
            !value && 'text-muted-foreground/70',
            className,
          )}
        >
          <Clock className="size-4 shrink-0 text-primary" />
          <span className="flex-1 truncate font-semibold">{value || placeholder}</span>
        </button>
      </P.Trigger>
      <P.Portal>
        <P.Content align="start" sideOffset={6} collisionPadding={12}
          className="z-[60] w-56 rounded-2xl border border-border bg-card p-3 text-foreground shadow-xl shadow-navy/10 data-[state=open]:animate-[dropdown-in_150ms_ease-out]">
          {/* one wheel like on an iPhone: no boxes, a shared band marks the chosen time, the edges fade out */}
          <div className="grid grid-cols-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>{t('timePicker.hours')}</span><span>{t('timePicker.minutes')}</span>
          </div>
          <div className="relative mt-1">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-9 -translate-y-1/2 rounded-xl bg-muted" />
            <div className="relative grid grid-cols-2">
              <Column label={t('timePicker.hours')} items={HOURS} selected={hour}
                onPick={h => set(h, minute || '00')} />
              <Column label={t('timePicker.minutes')} items={minutes} selected={minute}
                onPick={m => set(hour || '09', m)} />
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <button type="button" onClick={() => setOpen(false)}
              className="cursor-pointer rounded-lg px-3 py-1 text-xs font-semibold text-primary hover:bg-primary-soft">
              {t('timePicker.done')}
            </button>
          </div>
        </P.Content>
      </P.Portal>
    </P.Root>
  )
}

// One column of the wheel, endless like a revolver drum: after 23 come 00, 01… and before 00 come 23, 22… The list is
// repeated several times and, when the wheel stops, quietly moved back to the middle copy, so there is never an end.
// The item in the middle is the chosen one (scroll or tap); the chosen value is centred when the popup opens.
const ROW = 36 // h-9
const COPIES = 7
function Column({ label, items, selected, onPick }: { label: string; items: string[]; selected: string; onPick: (v: string) => void }) {
  const list = useRef<HTMLDivElement>(null)
  const settle = useRef<number | undefined>(undefined)
  const n = items.length
  const middle = Math.floor(COPIES / 2) * n
  const rows = Array.from({ length: COPIES * n }, (_, i) => items[i % n])
  // the selected value in the middle copy
  useEffect(() => {
    const el = list.current
    const i = items.indexOf(selected)
    if (!el || i < 0) return
    const at = Math.round(el.scrollTop / ROW)
    if (items[((at % n) + n) % n] !== selected || at < n || at >= (COPIES - 1) * n) el.scrollTop = (middle + i) * ROW
  }, [selected, items, n, middle])
  // when the wheel stops: the item in the middle is picked, and the wheel goes back to the middle copy unseen
  const onScroll = () => {
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      const el = list.current
      if (!el) return
      const at = Math.round(el.scrollTop / ROW)
      const i = ((at % n) + n) % n
      if (at < n || at >= (COPIES - 1) * n) el.scrollTop = (middle + i) * ROW
      if (items[i] !== selected) onPick(items[i])
    }, 120)
  }
  return (
    <div ref={list} role="listbox" aria-label={label} onScroll={onScroll}
      className="h-[180px] snap-y snap-mandatory overflow-y-auto overscroll-contain py-[72px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_bottom,transparent,black_35%,black_65%,transparent)]">
      {rows.map((v, k) => (
        <button key={k} type="button" role="option" aria-selected={v === selected && Math.floor(k / n) === Math.floor(COPIES / 2)} tabIndex={Math.floor(k / n) === Math.floor(COPIES / 2) ? 0 : -1}
          onClick={() => { onPick(v); list.current?.scrollTo({ top: k * ROW, behavior: 'smooth' }) }}
          className={cn('block h-9 w-full cursor-pointer snap-center text-base tabular-nums transition-colors',
            v === selected ? 'font-bold text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          {v}
        </button>
      ))}
    </div>
  )
}
