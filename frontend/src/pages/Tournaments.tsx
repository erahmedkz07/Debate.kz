import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react'
import { getCities, getTournaments } from '@/api'
import type { TournamentFilters } from '@/types'
import { useAsync } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'
import { Dialog, DialogClose, DialogTrigger, SheetContent } from '@/components/ui/dialog'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { TournamentCard, TournamentCardSkeleton } from '@/components/tournament/TournamentCard'

const PAGE_SIZE = 6

function Filters({ value, onChange, cities }: { value: TournamentFilters; onChange: (v: TournamentFilters) => void; cities: string[] }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="f-city">{t('tournaments.city')}</Label>
        <Select id="f-city" value={value.city ?? 'all'} onChange={e => onChange({ ...value, city: e.target.value })}>
          <option value="all">{t('tournaments.allCities')}</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <div>
        <Label>{t('tournaments.level')}</Label>
        <div className="flex flex-wrap gap-2">
          {(['all', 'school', 'university'] as const).map(l => (
            <button key={l} type="button" onClick={() => onChange({ ...value, level: l })}
              className={cn('cursor-pointer rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition-all', (value.level ?? 'all') === l ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50')}>
              {l === 'all' ? t('common.all') : t(`level.${l}`)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>{t('tournaments.status')}</Label>
        <div className="flex flex-wrap gap-2">
          {(['all', 'registration', 'ongoing', 'finished'] as const).map(s => (
            <button key={s} type="button" onClick={() => onChange({ ...value, status: s })}
              className={cn('cursor-pointer rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition-all', (value.status ?? 'all') === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50')}>
              {s === 'all' ? t('common.all') : t(`status.${s}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Tournaments() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [page, setPage] = useState(1)

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

  const activeCount = [filters.city, filters.level, filters.status].filter(v => v && v !== 'all').length
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

      <div className="container-page grid gap-8 py-10 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-border bg-card p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-bold">{t('tournaments.filters')}</h2>
              {activeCount > 0 && <button onClick={reset} className="cursor-pointer text-xs font-semibold text-primary hover:underline">{t('tournaments.reset')}</button>}
            </div>
            <Filters value={filters} onChange={setFilters} cities={cities} />
          </div>
        </aside>

        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-muted-foreground">{data && t('tournaments.found', { count: data.length })}</p>
            <div className="flex items-center gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden">
                    <SlidersHorizontal className="size-4" />{t('tournaments.filters')}
                    {activeCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">{activeCount}</span>}
                  </Button>
                </DialogTrigger>
                <SheetContent heading={t('tournaments.filters')} side="left">
                  <Filters value={filters} onChange={setFilters} cities={cities} />
                  <div className="mt-8 flex flex-col gap-2">
                    <DialogClose asChild><Button>{t('tournaments.apply')}</Button></DialogClose>
                    {activeCount > 0 && <Button variant="ghost" onClick={reset}>{t('tournaments.reset')}</Button>}
                  </div>
                </SheetContent>
              </Dialog>
              <Select aria-label={t('tournaments.sort')} value={filters.sort} onChange={e => setFilters({ ...filters, sort: e.target.value as TournamentFilters['sort'] })} className="h-9 text-xs font-semibold" containerClassName="w-48">
                <option value="date-asc">{t('tournaments.sortDateAsc')}</option>
                <option value="date-desc">{t('tournaments.sortDateDesc')}</option>
                <option value="teams">{t('tournaments.sortTeams')}</option>
              </Select>
            </div>
          </div>

          {error ? <ErrorState onRetry={reload} />
            : loading && !data ? (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <TournamentCardSkeleton key={i} />)}</div>
            ) : data && data.length === 0 ? (
              <EmptyState title={t('tournaments.emptyTitle')} text={t('tournaments.emptyText')} action={<Button variant="outline" onClick={reset}>{t('tournaments.reset')}</Button>} />
            ) : (
              <div className={cn('grid gap-6 transition-opacity sm:grid-cols-2 xl:grid-cols-3', loading && 'opacity-50')}>
                {pageItems.map(item => <TournamentCard key={item.id} t={item} />)}
              </div>
            )}

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
      </div>
    </>
  )
}
