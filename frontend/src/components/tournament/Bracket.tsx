import { useTranslation } from 'react-i18next'
import { Crown, Medal, Trophy } from 'lucide-react'
import { getBracket, type BracketDebate, type BracketPart } from '@/api'
import type { Team } from '@/types'
import { useAsync } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { isBP, useSides } from '@/lib/formats'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EntityLogo } from '@/components/ui/entity-logo'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'

// The playoffs on the tournament page: the champion, the seeds and the bracket round by round.
// Two-team formats: one winner goes on from each debate; BP: rooms of four, the top two go on.
export function PlayoffTab({ id }: { id: string }) {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => getBracket(id), [id])
  if (error) return <ErrorState onRetry={reload} />
  if (loading || !data) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
  if (!data.announced) return <EmptyState icon={<Trophy className="size-7" />} title={t('playoff.empty')} text={t('playoff.emptyText')} />
  return (
    <div className="space-y-10">
      <BracketView data={data} format={data.format} />
      {data.categories.filter(c => c.rounds.length).map(c => (
        <section key={c.key} aria-label={c.name}>
          <h2 className="mb-4 text-xl font-extrabold">{t('playoff.categoryBracket', { name: c.name })}</h2>
          <BracketView data={c} format={data.format} category={c.name} />
        </section>
      ))}
    </div>
  )
}

function BracketView({ data, format, category }: { data: BracketPart; format: string; category?: string }) {
  const { t } = useTranslation()
  const bp = isBP(format)
  const byId = new Map(data.seeds.map(s => [s.team.id, s]))
  if (!data.rounds.length) return null
  return (
    <div className="space-y-5">
      {data.champion && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent to-orange-400 p-5 text-navy sm:p-6">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"><Crown className="size-4" />{category ? t('playoff.categoryChampion', { name: category }) : t('playoff.champion')}</p>
          <div className="mt-2 flex items-center gap-3">
            <EntityLogo src={data.champion.logoUrl} name={data.champion.name} />
            <div>
              <p className="text-2xl font-extrabold">{data.champion.name}</p>
              {data.champion.institution && <p className="text-sm opacity-80">{data.champion.institution}</p>}
            </div>
          </div>
          <Trophy className="absolute -right-4 -top-4 size-32 opacity-15" />
        </div>
      )}

      {/* the bracket: one column per stage, scrolls sideways on a phone */}
      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="flex min-w-max gap-4">
          {data.rounds.map(r => {
            const rooms = r.teamsInRound / (bp ? 4 : 2)
            return (
              <section key={r.id} className="w-64 shrink-0" aria-label={t(`playoff.stages.${r.stage}`)}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="font-bold">{t(`playoff.stages.${r.stage}`)}</h3>
                  <Badge variant={r.status === 'completed' ? 'muted' : r.status === 'released' ? 'accent' : 'outline'}>{t(`tournament.roundStatus.${r.status}`)}</Badge>
                </div>
                {r.motion && <p className="mb-3 line-clamp-3 text-xs italic text-muted-foreground">«{r.motion}»</p>}
                <div className="flex flex-col justify-around gap-3" style={{ minHeight: `${Math.max(1, data.rounds[0].teamsInRound / (bp ? 4 : 2)) * 7}rem` }}>
                  {r.debates.length
                    ? r.debates.map(d => <MatchCard key={d.id} d={d} byId={byId} format={format} />)
                    : Array.from({ length: rooms }, (_, i) => (
                      <Card key={i} className="grid h-24 place-items-center border-dashed p-3 text-center text-xs text-muted-foreground">{t('playoff.pending')}</Card>
                    ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      <Card className="p-5">
        <h3 className="font-bold">{t('playoff.seeds')}</h3>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {data.seeds.map(s => (
            <li key={s.seed} className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2 text-sm">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">{s.seed}</span>
              <EntityLogo src={s.team.logoUrl} name={s.team.name} size="xs" />
              <span className="min-w-0 truncate font-semibold">{s.team.name}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}

function MatchCard({ d, byId, format }: { d: BracketDebate; byId: Map<string, { seed: number; team: Team }>; format: string }) {
  const { t } = useTranslation()
  const sides = useSides(format)
  const decided = !!d.winner
  return (
    <Card className="overflow-hidden">
      <p className="border-b border-border bg-muted/50 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">{d.room}</p>
      <ul className="divide-y divide-border">
        {d.teams.map(({ side, teamId }) => {
          const s = byId.get(teamId)
          const place = d.ranking ? d.ranking.indexOf(side) + 1 : 0
          // BP: the top two go on; two-team formats: the winner
          const through = d.ranking ? place > 0 && place <= 2 : d.winner === side
          return (
            <li key={side} className={cn('flex items-center gap-2 px-3 py-2 text-sm', decided && !through && 'text-muted-foreground')} title={sides[side]}>
              <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{s?.seed ?? ''}</span>
              <span className={cn('min-w-0 flex-1 truncate', through && 'font-bold text-foreground')}>{s?.team.name ?? '—'}</span>
              {place > 0 && <span className={cn('flex items-center gap-0.5 text-xs font-bold', place === 1 && 'text-success')}>{place === 1 && <Medal className="size-3" />}{t('ballot.placeN', { n: place })}</span>}
              {!d.ranking && through && <Trophy className="size-4 shrink-0 text-success" aria-label={t('tournament.winner')} />}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
