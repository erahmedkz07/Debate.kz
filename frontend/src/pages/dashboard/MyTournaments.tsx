import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarDays, ExternalLink, MapPin, Plus, Settings2, Users } from 'lucide-react'
import { getMyTournaments } from '@/api'
import { useAsync } from '@/lib/hooks'
import { formatDateRange } from '@/lib/utils'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorState, Skeleton } from '@/components/ui/states'
import { Ornament } from '@/components/brand'
import { Reveal } from '@/components/motion'

export default function MyTournaments() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(getMyTournaments)

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t('dashboard.myTournaments')}</h1>
          <p className="mt-1 text-muted-foreground">{t('dashboard.myTournamentsText')}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/dashboard/tournaments/new"
          className="group flex min-h-72 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-primary/40 bg-primary-soft/40 p-6 text-center transition-all hover:border-primary hover:bg-primary-soft">
          <span className="grid size-16 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform group-hover:scale-110 group-hover:rotate-6">
            <Plus className="size-8" />
          </span>
          <span className="text-lg font-bold text-primary">{t('nav.createTournament')}</span>
          <Ornament className="w-12 text-primary/20" />
        </Link>

        {error ? <div className="sm:col-span-2 xl:col-span-3"><ErrorState onRetry={reload} /></div>
          : loading || !data ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="min-h-72 rounded-2xl" />)
            : data.map((item, i) => (
              <Reveal key={item.id} delay={i * 0.06} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="relative h-32">
                  <img src={item.cover} alt="" className="size-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-navy/70 to-transparent" />
                  <Badge variant="glass" className="absolute left-3 top-3"><StatusDot status={item.status} />{t(`status.${item.status}`)}</Badge>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="font-bold leading-snug">{item.name}</h2>
                  <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                    <p className="flex items-center gap-2"><CalendarDays className="size-4 text-primary" />{formatDateRange(item.startDate, item.endDate)}</p>
                    <p className="flex items-center gap-2"><MapPin className="size-4 text-primary" />{item.city}</p>
                    <p className="flex items-center gap-2"><Users className="size-4 text-primary" />{t('common.teamsOf', { count: item.teamsCount, max: item.maxTeams })}</p>
                  </div>
                  <div className="mt-auto flex gap-2 pt-5">
                    <Button asChild size="sm" className="flex-1"><Link to={`/dashboard/tournaments/${item.id}`}><Settings2 className="size-4" />{t('dashboard.manage')}</Link></Button>
                    <Button asChild size="sm" variant="outline" aria-label={t('dashboard.public')} title={t('dashboard.public')}>
                      <Link to={`/tournaments/${item.id}`}><ExternalLink className="size-4" /></Link>
                    </Button>
                  </div>
                </div>
              </Reveal>
            ))}
      </div>
    </div>
  )
}
