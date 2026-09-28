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
          <div className="grid grid-cols-2 gap-2">
            <Column label={t('timePicker.hours')} items={HOURS} selected={hour}
              onPick={h => set(h, minute || '00')} />
            <Column label={t('timePicker.minutes')} items={minutes} selected={minute}
              onPick={m => set(hour || '09', m)} />
          </div>
          <div className="mt-3 flex justify-end border-t border-border pt-3">
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

// one scrolling column; the chosen value is scrolled into the middle when the popup opens
function Column({ label, items, selected, onPick }: { label: string; items: string[]; selected: string; onPick: (v: string) => void }) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (el && list.current) list.current.scrollTop = el.offsetTop - list.current.clientHeight / 2 + el.clientHeight / 2
  }, [selected])
  return (
    <div>
      <p className="mb-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div ref={list} role="listbox" aria-label={label}
        className="relative h-52 space-y-1 overflow-y-auto overscroll-contain rounded-xl bg-muted/50 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map(v => (
          <button key={v} type="button" role="option" aria-selected={v === selected} aria-pressed={v === selected} onClick={() => onPick(v)}
            className={cn(
              'block h-9 w-full cursor-pointer rounded-lg text-sm tabular-nums transition-colors',
              v === selected ? 'bg-primary font-bold text-primary-foreground shadow-md shadow-primary/25' : 'hover:bg-primary-soft hover:text-primary',
            )}>
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}
