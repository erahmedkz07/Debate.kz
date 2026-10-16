import { useState } from 'react'
import * as P from '@radix-ui/react-popover'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown } from 'lucide-react'
import { FORMATS, formatById, type FormatId } from '@/content/formats'
import { cn } from '@/lib/utils'

// The format, picked in one place: a button that shows the current one (its badge, name and teams) and opens every
// format as a card. Used by the timer, the score and break calculators and the formats guide.
export function FormatPicker({ value, onChange, label, className }: { value: string; onChange: (id: FormatId) => void; label?: string; className?: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const [open, setOpen] = useState(false)
  const current = formatById(value) ?? FORMATS[0]
  const badge = (f: typeof current, size = 'size-10') => (
    <span className={cn('grid shrink-0 place-items-center rounded-xl bg-gradient-to-br text-xs font-extrabold text-white shadow-sm', size, f.accent)}>{f.short}</span>
  )
  return (
    <div className={className}>
      {label && <p className="mb-1.5 text-sm font-semibold">{label}</p>}
      <P.Root open={open} onOpenChange={setOpen}>
        <P.Trigger asChild>
          <button type="button" aria-label={`${label ?? t('timer.format')}: ${current.name[lang]}`}
            className="group flex w-full max-w-md cursor-pointer items-center gap-3 rounded-2xl border-2 border-border bg-card p-2.5 pr-4 text-left transition-colors hover:border-primary/50 focus:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15 data-[state=open]:border-primary">
            {badge(current)}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{current.name[lang]}</span>
              <span className="block truncate text-xs text-muted-foreground">{current.teams[lang]}</span>
            </span>
            <span className="hidden text-xs font-semibold text-primary sm:inline">{t('formatPicker.change')}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </button>
        </P.Trigger>
        <P.Portal>
          <P.Content align="start" sideOffset={8} collisionPadding={12}
            className="z-[60] w-[min(44rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-card p-3 shadow-xl shadow-navy/10 data-[state=open]:animate-[dropdown-in_150ms_ease-out]">
            <p className="px-1 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('formatPicker.title')}</p>
            <div role="radiogroup" aria-label={label ?? t('timer.format')} className="grid max-h-[min(var(--radix-popover-content-available-height),26rem)] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {FORMATS.map(f => {
                const on = f.id === current.id
                return (
                  <button key={f.id} type="button" role="radio" aria-checked={on} onClick={() => { onChange(f.id); setOpen(false) }}
                    className={cn('relative flex cursor-pointer items-center gap-3 rounded-xl border-2 p-2.5 pr-9 text-left transition-colors',
                      on ? 'border-primary bg-primary-soft' : 'border-transparent hover:bg-muted')}>
                    {badge(f, 'size-9')}
                    <span className="min-w-0">
                      <span className="block text-sm font-bold leading-tight">{f.name[lang]}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{f.teams[lang]}</span>
                    </span>
                    {on && <Check className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-primary" />}
                  </button>
                )
              })}
            </div>
          </P.Content>
        </P.Portal>
      </P.Root>
    </div>
  )
}
