import { useEffect, useId, useMemo, useRef, useState } from 'react'
import * as P from '@radix-ui/react-popover'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, PenLine, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SearchOption {
  value: string
  label: string
  group?: string // a heading the option is listed under (a region, "Universities"…)
  hint?: string // a second line: a city, an abbreviation
  keywords?: string // other spellings to find it by (Kazakh name, abbreviation)
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SearchOption[]
  placeholder?: string
  id?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  'aria-label'?: string
  allLabel?: string // an "All …" first row (filters): picks ''
  allowCustom?: boolean // a name that is not listed may be used as typed
  customHint?: string // shown with the typed name: asks for the exact, full name
}

// letters only, ё = е, so "казну", "КазНУ" and "Каз НУ" find the same option
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '')

// A dropdown with a search box, for long lists (every city of Kazakhstan, every school): type a few letters, pick with
// the arrows and Enter or a click. Grouped by `group`; can let a name that is not listed be used as typed.
export function SearchSelect({ value, onChange, options, placeholder, id, disabled, invalid, className, allLabel, allowCustom, customHint, ...aria }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)

  const q = norm(query)
  const found = useMemo(() => {
    if (!q) return options
    const starts: SearchOption[] = [], has: SearchOption[] = []
    for (const o of options) {
      const hay = norm(`${o.label} ${o.keywords ?? ''} ${o.hint ?? ''}`)
      if (norm(o.label).startsWith(q)) starts.push(o)
      else if (hay.includes(q)) has.push(o)
    }
    return [...starts, ...has]
  }, [options, q])
  const typed = query.trim()
  const exact = found.some(o => norm(o.label) === q)
  // rows in the order they are shown: "All", the matches, then "use as typed"
  type Row = { kind: 'all' } | { kind: 'option'; o: SearchOption } | { kind: 'custom' }
  const rows: Row[] = [
    ...(allLabel && !q ? [{ kind: 'all' as const }] : []),
    ...found.slice(0, 200).map(o => ({ kind: 'option' as const, o })),
    ...(allowCustom && typed.length >= 2 && !exact ? [{ kind: 'custom' as const }] : []),
  ]
  useEffect(() => setActive(0), [q])
  useEffect(() => { listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active])

  const pick = (r: Row) => {
    onChange(r.kind === 'all' ? '' : r.kind === 'custom' ? typed : r.o.value)
    setOpen(false)
    setQuery('')
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, rows.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (rows[active]) pick(rows[active]) }
  }

  const current = options.find(o => o.value === value)
  const shown = value ? current?.label ?? value : allLabel ?? ''
  let lastGroup: string | undefined

  return (
    <P.Root open={open} onOpenChange={o => { setOpen(o); if (!o) setQuery('') }}>
      <P.Trigger asChild disabled={disabled}>
        <button type="button" id={id} aria-label={aria['aria-label']} aria-invalid={invalid} aria-haspopup="listbox"
          className={cn(
            'group flex h-11 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl border-2 border-border bg-card px-3.5 text-left text-sm text-foreground transition-colors',
            'hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 data-[state=open]:border-primary data-[state=open]:ring-4 data-[state=open]:ring-primary/15',
            'disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger',
            className,
          )}>
          <span className={cn('truncate', !shown && 'text-muted-foreground/70')}>{shown || placeholder}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </P.Trigger>
      <P.Portal>
        <P.Content align="start" sideOffset={6} collisionPadding={12} onOpenAutoFocus={e => e.preventDefault()}
          className="z-[60] w-[max(var(--radix-popover-trigger-width),16rem)] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-xl shadow-navy/10 data-[state=open]:animate-[dropdown-in_150ms_ease-out]">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKey} placeholder={t('common.searchList')}
              role="combobox" aria-expanded aria-controls={listId} aria-activedescendant={rows[active] ? `${listId}-${active}` : undefined}
              aria-label={aria['aria-label'] ?? placeholder} className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" />
          </div>
          <div ref={listRef} id={listId} role="listbox" className="max-h-[min(var(--radix-popover-content-available-height),18rem)] overflow-y-auto p-1.5">
            {rows.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('common.nothingFound')}</p>}
            {rows.map((r, i) => {
              const group = r.kind === 'option' && !q ? r.o.group : undefined
              const heading = group && group !== lastGroup ? group : undefined
              if (r.kind === 'option') lastGroup = r.o.group
              const selected = r.kind === 'all' ? !value : r.kind === 'option' && r.o.value === value
              return (
                <div key={r.kind === 'option' ? r.o.value : r.kind} role="presentation">
                  {heading && <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{heading}</p>}
                  {/* the search box keeps the focus and moves through the options (aria-activedescendant); the keys live there */}
                  {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
                  <div id={`${listId}-${i}`} data-index={i} role="option" aria-selected={selected} tabIndex={-1}
                    onMouseMove={() => setActive(i)} onClick={() => pick(r)}
                    className={cn('relative flex cursor-pointer select-none items-start gap-2 rounded-xl py-2.5 pl-3 pr-9 text-sm transition-colors',
                      i === active && 'bg-primary-soft text-primary', selected && 'font-bold text-primary')}>
                    {r.kind === 'custom' ? (
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-1.5"><PenLine className="size-3.5 shrink-0" />{t('common.useTyped', { name: typed })}</span>
                        {customHint && <span className="mt-0.5 text-xs font-normal text-muted-foreground">{customHint}</span>}
                      </span>
                    ) : (
                      <span className="flex min-w-0 flex-col">
                        <span>{r.kind === 'all' ? allLabel : r.o.label}</span>
                        {r.kind === 'option' && r.o.hint && <span className="text-xs font-normal text-muted-foreground">{r.o.hint}</span>}
                      </span>
                    )}
                    {selected && <Check className="absolute right-3 top-3 size-4" />}
                  </div>
                </div>
              )
            })}
          </div>
        </P.Content>
      </P.Portal>
    </P.Root>
  )
}
