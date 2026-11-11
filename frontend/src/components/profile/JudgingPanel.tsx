import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarDays, ChevronRight, ClipboardCheck, Clock, Crown, Gavel, MapPin } from 'lucide-react'
import type { JudgeAssignment } from '@/types'
import { cn, formatDateRange } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

// "Judging" in the profile: every tournament the person judged, newest first, with the rounds they sat in —
// room, teams, chair or wing, and whether their ballot is in. Shown only to people who have judged.
export function JudgingPanel({ items }: { items: JudgeAssignment[] }) {
  const { t } = useTranslation()
  const byTournament = new Map<string, JudgeAssignment[]>()
  for (const a of items) byTournament.set(a.tournament.id, [...(byTournament.get(a.tournament.id) ?? []), a])
  const chaired = items.filter(a => a.isChair).length
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: t('profile.judging.tournaments'), value: byTournament.size, icon: Gavel },
          { label: t('profile.judging.rounds'), value: items.length, icon: ClipboardCheck },
          { label: t('profile.judging.chaired'), value: chaired, icon: Crown },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-4">
            <Icon className="size-5 text-primary" />
            <p className="mt-2 text-2xl font-extrabold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </Card>
        ))}
      </div>
      {[...byTournament.values()].map(list => {
        const tour = list[0].tournament
        const dates = list.map(a => a.round.date).sort()
        return (
          <Card key={tour.id} className="overflow-hidden">
            <Link to={`/tournaments/${tour.id}`} className="group flex items-center gap-3 border-b border-border bg-muted/40 px-5 py-4 hover:bg-muted/70">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success-soft text-success"><Gavel className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold group-hover:text-primary">{tour.name}</span>
                <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><CalendarDays className="size-3.5" />{formatDateRange(dates[0], dates[dates.length - 1])}</span>
                  {tour.city && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{tour.city}</span>}
                </span>
              </span>
              <Badge variant="muted">{t('profile.judging.roundsN', { count: list.length })}</Badge>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground group-hover:text-primary" />
            </Link>
            <ul className="divide-y divide-border">
              {[...list].sort((a, b) => a.round.number - b.round.number).map(a => {
                const done = a.debate.ballotStatus !== 'pending' || a.round.status === 'completed'
                const teams = [a.proposition, a.opposition, a.closingProposition, a.closingOpposition].filter(Boolean).map(x => x!.name).join(' — ')
                return (
                  <li key={a.debate.id}>
                    <Link to={`/ballot/${a.debate.id}`} className="flex items-center gap-4 px-5 py-3 text-sm hover:bg-muted/40">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-xs font-extrabold">{a.round.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{teams}</span>
                        <span className="block truncate text-xs text-muted-foreground">{a.round.name}{a.debate.room && ` · ${a.debate.room}`}</span>
                      </span>
                      <Badge variant={a.isChair ? 'accent' : 'muted'}>{a.isChair ? t('profile.judging.chair') : t('profile.judging.wing')}</Badge>
                      <span className={cn('hidden items-center gap-1 text-xs font-semibold sm:flex', done ? 'text-success' : 'text-muted-foreground')}>
                        {done ? <ClipboardCheck className="size-4" /> : <Clock className="size-4" />}{done ? t('profile.judging.done') : t('profile.judging.waiting')}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
        )
      })}
    </div>
  )
}
