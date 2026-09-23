import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, CalendarDays, MapPin, Users } from 'lucide-react'
import type { Tournament } from '@/types'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/states'
import { formatDateRange } from '@/lib/utils'

export function TournamentCard({ t: item }: { t: Tournament }) {
  const { t } = useTranslation()
  const fill = Math.round((item.teamsCount / item.maxTeams) * 100)

  return (
    <Link
      to={`/tournaments/${item.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        <img src={item.cover} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy/60 via-transparent to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Badge variant="glass"><StatusDot status={item.status} />{t(`status.${item.status}`)}</Badge>
        </div>
        <div className="absolute bottom-3 left-3 flex gap-1.5">
          <Badge variant="accent">{item.format}</Badge>
          <Badge variant="glass">{t(`level.${item.level}`)}</Badge>
        </div>
        <span className="absolute right-3 top-3 grid size-9 translate-y-1 place-items-center rounded-full bg-white text-navy opacity-0 shadow transition-all group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowUpRight className="size-4" />
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold leading-snug transition-colors group-hover:text-primary">{item.name}</h3>
        <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <p className="flex items-center gap-2"><MapPin className="size-4 shrink-0 text-primary" />{item.city}</p>
          <p className="flex items-center gap-2"><CalendarDays className="size-4 shrink-0 text-primary" />{formatDateRange(item.startDate, item.endDate)}</p>
        </div>
        <div className="mt-auto pt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-muted-foreground"><Users className="size-3.5" />{t('common.teamsOf', { count: item.teamsCount, max: item.maxTeams })}</span>
            <span className="text-foreground">{fill}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${fill}%` }} />
          </div>
        </div>
      </div>
    </Link>
  )
}

export function TournamentCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <Skeleton className="aspect-[16/9] rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-6 h-2 w-full" />
      </div>
    </div>
  )
}
