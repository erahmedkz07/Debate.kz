import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react'
import { getCities, getTournaments } from '@/api'
import type { TournamentFilters } from '@/types'
import { useAsync } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { TournamentCard, TournamentCardSkeleton } from '@/components/tournament/TournamentCard'

const PAGE_SIZE = 6

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn('cursor-pointer rounded-full border-2 px-3.5 py-1.5 text-sm font-semibold transition-all',
        active ? 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20' : 'border-border bg-card hover:border-primary/50')}>
      {children}
    </button>
  )
}

export default function Tournaments() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false)

  const filters: TournamentFilters = {
    search: params.get('q') ?? '',
    city: params.get('city') ?? 'all',
    level: (params.get('level') as TournamentFilters['level']) ?? 'all',
    status: (params.get('status') as TournamentFilters['status']) ?? 'all',
    sort: (params.get('sort') as TournamentFilters['sort']) ?? 'date-asc',
  }
  const key = params.toString()

  const setFilters = (f: TournamentFilters) => {
    const next = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => {
      const name = k === 'search' ? 'q' : k
      if (v && v !== 'all' && !(k === 'sort' && v === 'date-asc')) next.set(name, String(v))
    })
    setParams(next, { replace: true })
    setPage(1)
  }

  // debounce search input into the URL
  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get('q') ?? '') !== search) setFilters({ ...filters, search })
    }, 350)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const { data, loading, error, reload } = useAsync(() => getTournaments(filters), [key])
  const { data: cities = [] } = useAsync(getCities)

  // active filters shown as removable chips
  const active = [
    filters.city !== 'all' && { key: 'city', label: filters.city! },
    filters.level !== 'all' && { key: 'level', label: t(`level.${filters.level}`) },
    filters.status !== 'all' && { key: 'status', label: t(`status.${filters.status}`) },
  ].filter(Boolean) as { key: 'city' | 'level' | 'status'; label: string }[]

  const totalPages = Math.max(1, Math.ceil((data?.length ?? 0) / PAGE_SIZE))
  const pageItems = useMemo(() => data?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? [], [data, page])
  const reset = () => { setSearch(''); setParams(new URLSearchParams(), { replace: true }); setPage(1) }

  return (
    <>
      <PageHeader title={t('tournaments.title')} subtitle={t('tournaments.subtitle')}>
        <div className="relative mt-8 max-w-2xl">
          <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('tournaments.searchPlaceholder')}
            className="h-14 rounded-2xl pl-12 text-base shadow-lg shadow-primary/5" aria-label={t('common.search')} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Clear">
              <X className="size-4" />
            </button>
          )}
        </div>
      </PageHeader>

      <div className="container-page py-8 sm:py-10">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant={open ? 'primary' : 'outline'} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls="filters-panel">
            <SlidersHorizontal className="size-4" />{t('tournaments.filters')}
            {active.length > 0 && (
              <span className={cn('grid size-5 place-items-center rounded-full text-[11px] font-bold', open ? 'bg-white text-primary' : 'bg-primary text-primary-foreground')}>{active.length}</span>
            )}
            <ChevronDown className={cn('size-4 transition-transform duration-200', open && 'rotate-180')} />
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <AnimatePresence initial={false}>
              {active.map(f => (
                <motion.button key={f.key} layout initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
                  onClick={() => setFilters({ ...filters, [f.key]: 'all' })}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full bg-primary-soft py-1.5 pl-3 pr-2 text-sm font-semibold text-primary hover:bg-primary/15">
                  {f.label}<X className="size-3.5" />
                </motion.button>
              ))}
            </AnimatePresence>
            {active.length > 0 && (
              <button onClick={reset} className="cursor-pointer text-sm font-semibold text-muted-foreground hover:text-primary">{t('tournaments.reset')}</button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <p className="hidden text-sm font-semibold text-muted-foreground sm:block">{data && t('tournaments.found', { count: data.length })}</p>
            <Select size="sm" className="w-52" aria-label={t('tournaments.sort')} value={filters.sort}
              onValueChange={v => setFilters({ ...filters, sort: v as TournamentFilters['sort'] })}
              options={[
                { value: 'date-asc', label: t('tournaments.sortDateAsc') },
                { value: 'date-desc', label: t('tournaments.sortDateDesc') },
                { value: 'teams', label: t('tournaments.sortTeams') },
              ]} />
          </div>
        </div>

        {/* collapsible filters panel */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div id="filters-panel" key="panel"
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
              <div className="mt-4 grid grid-cols-1 gap-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6 md:grid-cols-[minmax(0,16rem)_1fr_1fr] [&>*]:min-w-0">
                <div>
                  <Label htmlFor="f-city">{t('tournaments.city')}</Label>
                  <Select id="f-city" value={filters.city} onValueChange={v => setFilters({ ...filters, city: v })}
                    options={[{ value: 'all', label: t('tournaments.allCities') }, ...cities.map(c => ({ value: c, label: c }))]} />
                </div>
                <div>
                  <Label>{t('tournaments.level')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {(['all', 'school', 'university'] as const).map(l => (
                      <Chip key={l} active={filters.level === l} onClick={() => setFilters({ ...filters, level: l })}>
                        {l === 'all' ? t('common.all') : t(`level.${l}`)}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>{t('tournaments.status')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {(['all', 'registration', 'ongoing', 'finished'] as const).map(s => (
                      <Chip key={s} active={filters.status === s} onClick={() => setFilters({ ...filters, status: s })}>
                        {s === 'all' ? t('common.all') : t(`status.${s}`)}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-4 md:col-span-3">
                  <p className="text-sm font-semibold text-muted-foreground">{data && t('tournaments.found', { count: data.length })}</p>
                  <div className="flex gap-2">
                    {active.length > 0 && <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="size-4" />{t('tournaments.reset')}</Button>}
                    <Button size="sm" onClick={() => setOpen(false)}>{t('tournaments.apply')}</Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8">
          {error ? <ErrorState onRetry={reload} />
            : loading && !data ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <TournamentCardSkeleton key={i} />)}</div>
            ) : data && data.length === 0 ? (
              <EmptyState title={t('tournaments.emptyTitle')} text={t('tournaments.emptyText')} action={<Button variant="outline" onClick={reset}>{t('tournaments.reset')}</Button>} />
            ) : (
              <div className={cn('grid gap-6 transition-opacity sm:grid-cols-2 lg:grid-cols-3', loading && 'opacity-50')}>
                {pageItems.map(item => <TournamentCard key={item.id} t={item} />)}
              </div>
            )}
        </div>

        {data && totalPages > 1 && (
          <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
            <Button variant="outline" size="icon" disabled={page === 1} onClick={() => setPage(p => p - 1)} aria-label={t('common.back')}><ChevronLeft className="size-4" /></Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <Button key={n} variant={n === page ? 'primary' : 'ghost'} size="icon" onClick={() => setPage(n)} aria-current={n === page ? 'page' : undefined}>{n}</Button>
            ))}
            <Button variant="outline" size="icon" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} aria-label={t('common.next')}><ChevronRight className="size-4" /></Button>
          </nav>
        )}
      </div>
    </>
  )
}
