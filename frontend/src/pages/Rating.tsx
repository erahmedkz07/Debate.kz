import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Crown, MapPin, Users } from 'lucide-react'
import { getRating } from '@/api'
import type { Ref, TournamentLevel } from '@/types'
import { useAsync } from '@/lib/hooks'
import { cn, formatNumber, initials } from '@/lib/utils'
import { PageHeader } from '@/components/layout/Layout'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import { Reveal } from '@/components/motion'
import { EntityLogo } from '@/components/ui/entity-logo'

// one table row: name, where they are from (club · team), city and two numbers
type Row = { rank: number; name: string; href?: string; club?: Ref; logo?: string; hasLogo?: boolean; sub: string; city: string; value: string; extra: string }

// "Club · Team": the club links to its page
function From({ club, sub }: { club?: Ref; sub: string }) {
  if (!club) return <>{sub}</>
  return (
    <>
      <Link to={`/clubs/${club.id}`} className="font-medium text-primary hover:underline">{club.name}</Link>
      {sub && sub !== club.name && <> · {sub}</>}
    </>
  )
}

function Podium({ rows }: { rows: Row[] }) {
  const order = [rows[1], rows[0], rows[2]].filter(Boolean)
  const heights = ['h-24', 'h-32', 'h-20']
  const styles = ['bg-slate-200 text-slate-700', 'bg-accent text-navy', 'bg-orange-200 text-orange-800']
  if (rows.length < 3) return null
  return (
    <div className="mx-auto mb-10 grid max-w-2xl grid-cols-3 items-end gap-3 sm:gap-5">
      {order.map((r, i) => (
        <Reveal key={r.rank} delay={i * 0.1} className="text-center">
          {r.rank === 1 && <Crown className="mx-auto mb-1 size-7 text-accent drop-shadow" fill="currentColor" />}
          {r.logo
            ? <img src={r.logo} alt="" className={cn('mx-auto rounded-full border-4 border-card bg-white object-contain shadow-lg', r.rank === 1 ? 'size-20' : 'size-16')} />
            : <span className={cn('mx-auto grid place-items-center rounded-full border-4 border-card font-extrabold shadow-lg', r.rank === 1 ? 'size-20 text-xl' : 'size-16 text-lg', styles[i])}>
                {initials(r.name)}
              </span>}
          <p className="mt-2 truncate text-sm font-bold sm:text-base">{r.href ? <Link to={r.href} className="hover:text-primary">{r.name}</Link> : r.name}</p>
          <p className="truncate text-xs text-muted-foreground"><From club={r.club} sub={r.sub} /></p>
          <div className={cn('mt-3 grid place-items-center rounded-t-2xl text-2xl font-extrabold', heights[i], r.rank === 1 ? 'bg-primary text-primary-foreground' : 'bg-primary-soft text-primary')}>
            {r.rank}
          </div>
        </Reveal>
      ))}
    </div>
  )
}

function Table({ rows, nameLabel, valueLabel, extraLabel }: { rows: Row[]; nameLabel: string; valueLabel: string; extraLabel: string }) {
  const { t } = useTranslation()
  if (!rows.length) return <EmptyState icon={<Users className="size-7" />} title={t('rating.empty')} />
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border">
        <li className="hidden grid-cols-[3rem_1fr_8rem_6rem_6rem] gap-4 bg-muted/70 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:grid">
          <span>#</span><span>{nameLabel}</span><span>{t('common.city')}</span><span className="text-right">{extraLabel}</span><span className="text-right">{valueLabel}</span>
        </li>
        {rows.map(r => (
          <li key={r.rank + r.name} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-4 py-3.5 hover:bg-muted/40 sm:grid-cols-[3rem_1fr_8rem_6rem_6rem] sm:gap-4 sm:px-5">
            <span className={cn('font-bold', r.rank <= 3 ? 'text-primary' : 'text-muted-foreground')}>{r.rank}</span>
            <div className="flex min-w-0 items-center gap-3">
              {r.hasLogo !== false && <EntityLogo src={r.logo} name={r.name} size="sm" />}
              <div className="min-w-0">
                <p className="truncate font-bold">{r.href ? <Link to={r.href} className="hover:text-primary">{r.name}</Link> : r.name}</p>
                <p className="truncate text-xs text-muted-foreground"><From club={r.club} sub={r.sub} /><span className="sm:hidden"> · {r.city}</span></p>
              </div>
            </div>
            <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex"><MapPin className="size-3.5" />{r.city}</span>
            <span className="hidden text-right text-sm tabular-nums sm:block">{r.extra}</span>
            <span className="text-right font-extrabold tabular-nums text-primary">{r.value}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export default function Rating() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(getRating)
  const [level, setLevel] = useState<TournamentLevel | 'all'>('all')
  const fits = (l: TournamentLevel | 'mixed') => level === 'all' || l === level || l === 'mixed'

  const teams: Row[] = (data?.teams ?? []).filter(r => fits(r.level))
    .map((r, i) => ({ rank: i + 1, name: r.name, club: r.club, logo: r.logoUrl, sub: r.club ? '' : r.institution, city: r.city, value: formatNumber(r.points), extra: String(r.wins) }))
  const speakers: Row[] = (data?.speakers ?? []).filter(r => fits(r.level))
    .map((r, i) => ({ rank: i + 1, name: r.name, club: r.club, hasLogo: false, sub: r.team, city: r.city, value: r.average.toFixed(1), extra: String(r.tournaments) }))
  const clubs: Row[] = (data?.clubs ?? []).filter(r => fits(r.level))
    .map((r, i) => ({
      rank: i + 1, name: r.name, href: `/clubs/${r.id}`, logo: r.logoUrl, city: r.city, value: String(r.wins),
      sub: t('rating.clubSub', { teams: r.teams, tournaments: r.tournaments, average: r.speakerAverage.toFixed(1) }), extra: `${r.winRate}%`,
    }))

  return (
    <>
      <PageHeader title={t('rating.title')} subtitle={t('rating.subtitle')} />
      <div className="container-page py-10">
        {error ? <ErrorState onRetry={reload} /> : (
          <Tabs defaultValue="teams">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="teams">{t('rating.teams')}</TabsTrigger>
                <TabsTrigger value="speakers">{t('rating.speakers')}</TabsTrigger>
                <TabsTrigger value="clubs">{t('rating.clubs')}</TabsTrigger>
              </TabsList>
              <div className="flex gap-1 rounded-2xl bg-muted p-1">
                {(['all', 'school', 'university'] as const).map(l => (
                  <button key={l} onClick={() => setLevel(l)}
                    className={cn('cursor-pointer rounded-xl px-3 py-2 text-xs font-semibold transition-all sm:text-sm', level === l ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    {l === 'all' ? t('common.all') : t(`level.${l}`)}
                  </button>
                ))}
              </div>
            </div>
            {loading || !data ? (
              <div className="mt-8 space-y-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : (
              <>
                <TabsContent value="teams" className="mt-10">
                  <Podium rows={teams} />
                  <Table rows={teams} nameLabel={t('common.team')} valueLabel={t('common.points')} extraLabel={t('common.wins')} />
                </TabsContent>
                <TabsContent value="speakers" className="mt-10">
                  <Podium rows={speakers} />
                  <Table rows={speakers} nameLabel={t('common.speaker')} valueLabel={t('rating.average')} extraLabel={t('rating.tournaments')} />
                </TabsContent>
                <TabsContent value="clubs" className="mt-10">
                  <Podium rows={clubs} />
                  <Table rows={clubs} nameLabel={t('rating.club')} valueLabel={t('common.wins')} extraLabel={t('rating.winRate')} />
                  <p className="mt-4 text-xs text-muted-foreground">{t('rating.clubsHint')}</p>
                </TabsContent>
              </>
            )}
          </Tabs>
        )}
      </div>
    </>
  )
}
