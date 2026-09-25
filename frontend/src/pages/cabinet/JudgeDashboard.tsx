import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ClipboardList, ClipboardPen, DoorOpen, Gavel, History, Star, Trophy } from 'lucide-react'
import { getJudgeAssignments } from '@/api'
import type { JudgeAssignment } from '@/types'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { cn, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import { CabinetHeader } from '@/pages/dashboard/DashboardLayout'

function AssignmentCard({ a }: { a: JudgeAssignment }) {
  const { t } = useTranslation()
  const pending = a.debate.ballotStatus === 'pending'
  const done = a.debate.ballotStatus === 'confirmed'
  const winner = a.debate.winner === 'proposition' ? a.proposition : a.debate.winner === 'opposition' ? a.opposition : null
  return (
    <Card className={cn('overflow-hidden', pending && 'ring-2 ring-accent')}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-5 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-bold">{a.tournament.name}</span>
          <span className="text-muted-foreground">· {a.round.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {a.isChair && <Badge variant="primary"><Star className="size-3" fill="currentColor" />{t('tournament.chair')}</Badge>}
          <Badge variant={pending ? 'accent' : done ? 'success' : 'primary'}>{t(`dashboard.ballots.${a.debate.ballotStatus}`)}</Badge>
        </div>
      </div>
      <div className="p-5">
        <p className="text-sm italic text-muted-foreground">«{a.round.motion}»</p>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <div className={cn('rounded-xl bg-primary-soft p-3', winner?.id === a.proposition.id && 'ring-2 ring-success')}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{t('tournament.proposition')}</p>
            <p className="font-bold">{a.proposition.name}</p>
          </div>
          <span className="text-xs font-extrabold text-muted-foreground">VS</span>
          <div className={cn('rounded-xl bg-muted p-3', winner?.id === a.opposition.id && 'ring-2 ring-success')}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('tournament.opposition')}</p>
            <p className="font-bold">{a.opposition.name}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><DoorOpen className="size-4" />{a.debate.room}</span>
            <span>{formatDate(a.round.date)}</span>
          </span>
          {done
            ? <span className="flex items-center gap-1.5 text-sm font-semibold text-success"><Trophy className="size-4" />{winner?.name}</span>
            : (
              <Button asChild size="sm" variant={pending ? 'accent' : 'outline'}>
                <Link to={`/ballot/${a.debate.id}`}><ClipboardPen className="size-4" />{pending ? t('judge.fillBallot') : t('judge.editBallot')}</Link>
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

  const active = data?.filter(a => a.debate.ballotStatus !== 'confirmed') ?? []
  const history = data?.filter(a => a.debate.ballotStatus === 'confirmed') ?? []
  const pending = active.filter(a => a.debate.ballotStatus === 'pending').length

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6">
      <CabinetHeader title={t('judge.title')} subtitle={t('judge.subtitle')} />

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

      {error ? <div className="mt-8"><ErrorState onRetry={reload} /></div> : loading || !data ? (
        <div className="mt-8 grid gap-4 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      ) : (
        <>
          <h2 className="mt-10 flex items-center gap-2 text-xl font-bold"><ClipboardList className="size-5 text-primary" />{t('judge.active')}</h2>
          {active.length === 0
            ? <div className="mt-4"><EmptyState icon={<Gavel className="size-7" />} title={t('judge.noActive')} text={t('judge.howToBecome')} /></div>
            : <div className="mt-4 grid gap-4 lg:grid-cols-2">{active.map(a => <AssignmentCard key={a.debate.id} a={a} />)}</div>}

          <h2 className="mt-12 flex items-center gap-2 text-xl font-bold"><History className="size-5 text-primary" />{t('judge.history')}</h2>
          {history.length === 0
            ? <div className="mt-4"><EmptyState icon={<History className="size-7" />} title={t('judge.noHistory')} /></div>
            : <div className="mt-4 grid gap-4 lg:grid-cols-2">{history.map(a => <AssignmentCard key={a.debate.id} a={a} />)}</div>}
        </>
      )}
    </div>
  )
}
