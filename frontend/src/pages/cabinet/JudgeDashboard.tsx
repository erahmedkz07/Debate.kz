import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ClipboardList, ClipboardPen, DoorOpen, Gavel, History, Timer, Star, Trophy } from 'lucide-react'
import { getJudgeAssignments } from '@/api'
import type { JudgeAssignment } from '@/types'
import { useAuth } from '@/lib/auth'
import { sidesOf, useSides } from '@/lib/formats'
import { useRoundName } from '@/lib/rounds'
import { OnlineLink } from '@/components/tournament/OnlineLink'
import { useAsync } from '@/lib/hooks'
import { cn, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import { CabinetHeader } from '@/pages/dashboard/DashboardLayout'

function AssignmentCard({ a }: { a: JudgeAssignment }) {
  const { t } = useTranslation()
  const pending = a.debate.ballotStatus === 'pending'
  const done = a.debate.ballotStatus === 'confirmed'
  const names = useSides(a.tournament.format)
  const roundName = useRoundName()
  // BP: four teams; the chair sends the agreed ballot and the wings read it
  const sideList = sidesOf(a.tournament.format).filter(side => a[side])
  const bp = sideList.length === 4
  const winner = a.debate.winner ? a[a.debate.winner] ?? null : null
  const canSend = !bp || a.isChair
  return (
    <Card className={cn('overflow-hidden', pending && 'ring-2 ring-accent')}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-5 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Link to={`/tournaments/${a.tournament.id}`} className="font-bold hover:text-primary hover:underline">{a.tournament.name}</Link>
          <span className="text-muted-foreground">· {roundName(a.round)}</span>
        </div>
        <div className="flex items-center gap-2">
          {a.isChair && <Badge variant="primary"><Star className="size-3" fill="currentColor" />{t('tournament.chair')}</Badge>}
          <Badge variant={pending ? 'accent' : done ? 'success' : 'primary'}>{t(`dashboard.ballots.${a.debate.ballotStatus}`)}</Badge>
        </div>
      </div>
      <div className="p-5">
        <p className="text-sm italic text-muted-foreground">«{a.round.motion}»</p>
        <div className={cn('mt-4 grid items-center gap-3 text-center', bp ? 'grid-cols-2' : 'grid-cols-[1fr_auto_1fr]')}>
          {sideList.map((side, i) => {
            const team = a[side]!
            const gov = side === 'proposition' || side === 'closingProposition'
            return [
              !bp && i === 1 && <span key="vs" className="text-xs font-extrabold text-muted-foreground">VS</span>,
              <div key={side} className={cn('rounded-xl p-3', gov ? 'bg-primary-soft' : 'bg-muted', winner?.id === team.id && 'ring-2 ring-success')}>
                <p className={cn('text-[10px] font-bold uppercase tracking-wider', gov ? 'text-primary' : 'text-muted-foreground')}>{names[side]}</p>
                <p className="font-bold">{team.name}</p>
              </div>,
            ]
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><DoorOpen className="size-4" />{a.debate.room}</span>
            <OnlineLink url={a.debate.onlineUrl} />
            <span>{formatDate(a.round.date)}</span>
          </span>
          {done
            ? <span className="flex items-center gap-1.5 text-sm font-semibold text-success"><Trophy className="size-4" />{winner?.name}</span>
            : (
              <Button asChild size="sm" variant={pending ? 'accent' : 'outline'}>
                <Link to={`/ballot/${a.debate.id}`}><ClipboardPen className="size-4" />{!canSend ? t('judge.viewBallot') : pending ? t('judge.fillBallot') : t('judge.editBallot')}</Link>
              </Button>
            )}
        </div>
      </div>
    </Card>
  )
}

export default function JudgeDashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data, loading, error, reload } = useAsync(getJudgeAssignments, [user?.id])
  const [tournament, setTournament] = useState('all')
  // judges who work several tournaments can narrow the list to one
  const tournaments = [...new Map((data ?? []).map(a => [a.tournament.id, a.tournament.name])).entries()]
  const shown = (data ?? []).filter(a => tournament === 'all' || a.tournament.id === tournament)

  const active = shown.filter(a => a.debate.ballotStatus !== 'confirmed')
  const history = shown.filter(a => a.debate.ballotStatus === 'confirmed')
  const pending = active.filter(a => a.debate.ballotStatus === 'pending').length

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6">
      <CabinetHeader title={t('judge.title')} subtitle={t('judge.subtitle')}
        action={<Button asChild variant="outline"><Link to="/timer"><Timer className="size-4" />{t('timer.title')}</Link></Button>} />

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: t('judge.stats.total'), value: data?.length, icon: Gavel, color: 'bg-primary-soft text-primary' },
          { label: t('judge.stats.pending'), value: pending, icon: ClipboardList, color: 'bg-accent-soft text-navy dark:text-accent' },
          { label: t('judge.stats.done'), value: history.length, icon: CheckCircle2, color: 'bg-success-soft text-success' },
          { label: t('judge.stats.chair'), value: data?.filter(a => a.isChair).length, icon: Star, color: 'bg-danger-soft text-danger' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-5">
            <span className={cn('grid size-10 place-items-center rounded-xl', color)}><Icon className="size-5" /></span>
            <p className="mt-4 text-3xl font-extrabold tabular-nums">{value ?? '—'}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </Card>
        ))}
      </div>

      {tournaments.length > 1 && (
        <div className="mt-6 max-w-sm">
          <Select value={tournament} onValueChange={setTournament} aria-label={t('judge.filter')}
            options={[{ value: 'all', label: t('judge.allTournaments') }, ...tournaments.map(([id, name]) => ({ value: id, label: name }))]} />
        </div>
      )}

      {error ? <div className="mt-8"><ErrorState onRetry={reload} /></div> : loading || !data ? (
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      ) : (
        <>
          <h2 className="mt-10 flex items-center gap-2 text-xl font-bold"><ClipboardList className="size-5 text-primary" />{t('judge.active')}</h2>
          {active.length === 0
            ? <div className="mt-4"><EmptyState icon={<Gavel className="size-7" />} title={t('judge.noActive')} text={t('judge.howToBecome')} /></div>
            : <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">{active.map(a => <AssignmentCard key={a.debate.id} a={a} />)}</div>}

          <h2 className="mt-12 flex items-center gap-2 text-xl font-bold"><History className="size-5 text-primary" />{t('judge.history')}</h2>
          {history.length === 0
            ? <div className="mt-4"><EmptyState icon={<History className="size-7" />} title={t('judge.noHistory')} /></div>
            : <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">{history.map(a => <AssignmentCard key={a.debate.id} a={a} />)}</div>}
        </>
      )}
    </div>
  )
}
