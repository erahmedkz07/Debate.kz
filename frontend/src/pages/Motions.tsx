import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { BookOpen, ChevronLeft, ChevronRight, Copy, Search } from 'lucide-react'
import { getMotions } from '@/api'
import type { MotionTopic } from '@/types'
import { useAsync } from '@/lib/hooks'
import { cn, formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/layout/Layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'

const TOPICS: MotionTopic[] = ['education', 'technology', 'economy', 'politics', 'international', 'environment', 'society', 'rights', 'media', 'health', 'culture', 'sport']

// Motion bank: every released motion of past and current tournaments, for preparation and training
export default function Motions() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const filters = {
    search: params.get('q') ?? undefined,
    level: (params.get('level') ?? undefined) as 'school' | 'university' | undefined,
    lang: (params.get('lang') ?? undefined) as 'ru' | 'kz' | undefined,
    topic: (params.get('topic') ?? undefined) as MotionTopic | undefined,
    page: Number(params.get('page') ?? 1),
  }
  const { data, loading, error, reload } = useAsync(() => getMotions(filters), [params.toString()])
  const set = (key: string, value?: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  // search as you type, without a request per key press
  useEffect(() => {
    const id = setTimeout(() => { if ((params.get('q') ?? '') !== search.trim()) set('q', search.trim() || undefined) }, 350)
    return () => clearTimeout(id)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('motions.copied'))
    } catch {
      toast.error(t('motions.copyFailed'))
    }
  }

  return (
    <>
      <PageHeader title={t('motions.title')} subtitle={t('motions.subtitle')}>
        <div className="mt-6 flex flex-wrap gap-3">
          <div className="relative min-w-60 flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('motions.search')} className="pl-10" aria-label={t('common.search')} />
          </div>
          <Select className="w-44" value={filters.level ?? 'all'} onValueChange={v => set('level', v === 'all' ? undefined : v)} aria-label={t('wizard.level')}
            options={[{ value: 'all', label: t('motions.allLevels') }, { value: 'school', label: t('level.school') }, { value: 'university', label: t('level.university') }]} />
          <Select className="w-40" value={filters.lang ?? 'all'} onValueChange={v => set('lang', v === 'all' ? undefined : v)} aria-label={t('motions.language')}
            options={[{ value: 'all', label: t('motions.allLanguages') }, { value: 'ru', label: t('motions.lang.ru') }, { value: 'kz', label: t('motions.lang.kz') }]} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t('motions.topic')}>
          {TOPICS.map(topic => {
            const active = filters.topic === topic
            const count = data?.topicCounts[topic] ?? 0
            // topics without motions only add noise
            if (data && !count && !active) return null
            return (
              <button key={topic} type="button" aria-pressed={active} onClick={() => set('topic', active ? undefined : topic)}
                className={cn('cursor-pointer rounded-full border-2 px-3 py-1 text-sm font-semibold transition-all',
                  active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/50')}>
                {t(`motions.topics.${topic}`)} <span className="opacity-60">{count}</span>
              </button>
            )
          })}
        </div>
      </PageHeader>

      <div className="container-page py-10">
        {error ? <ErrorState onRetry={reload} /> : loading && !data ? (
          <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-40" />)}</div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon={<BookOpen className="size-7" />} title={t('motions.empty')} text={t('motions.emptyText')} />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">{t('motions.found', { count: data.total })}</p>
            <div className={cn('grid gap-4 md:grid-cols-2', loading && 'opacity-60')}>
              {data.items.map(m => (
                <Card key={m.id} className="flex flex-col p-5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="muted">{t(`level.${m.tournament.level}`)}</Badge>
                    <Badge variant="outline">{t(`motions.lang.${m.language}`)}</Badge>
                    {m.topics.map(topic => <Badge key={topic} variant="primary">{t(`motions.topics.${topic}`)}</Badge>)}
                  </div>
                  <p className="mt-3 text-lg font-bold leading-snug">«{m.motion}»</p>
                  {m.infoSlide && (
                    <details className="mt-3 rounded-xl bg-muted/60 p-3 text-sm">
                      <summary className="cursor-pointer font-semibold">{t('motions.infoSlide')}</summary>
                      <p className="mt-2 whitespace-pre-line text-muted-foreground">{m.infoSlide}</p>
                    </details>
                  )}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-xs text-muted-foreground">
                    <Link to={`/tournaments/${m.tournament.id}`} className="hover:text-primary hover:underline">
                      {m.tournament.name} · {m.round} · {formatDate(m.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => copy(m.motion)}><Copy className="size-4" />{t('motions.copy')}</Button>
                  </div>
                </Card>
              ))}
            </div>
            {data.pages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <Button variant="outline" size="icon" disabled={data.page <= 1} onClick={() => set('page', String(data.page - 1))} aria-label={t('motions.prev')}><ChevronLeft className="size-4" /></Button>
                <span className="text-sm font-semibold tabular-nums">{data.page} / {data.pages}</span>
                <Button variant="outline" size="icon" disabled={data.page >= data.pages} onClick={() => set('page', String(data.page + 1))} aria-label={t('motions.next')}><ChevronRight className="size-4" /></Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
