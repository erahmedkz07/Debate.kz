import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ClipboardList, ClipboardPen, DoorOpen, Gavel, History, Megaphone, Star, Trophy } from 'lucide-react'
import { getJudgeAssignments, getJudgeProfile, getMyJudgeApplications } from '@/api'
import type { JudgeAssignment, JudgeProfile } from '@/types'
import { LevelBadge } from '@/components/judge/LevelBadge'
import { useAuth } from '@/lib/auth'
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
  const winner = a.debate.winner === 'proposition' ? a.proposition : a.debate.winner === 'opposition' ? a.opposition : null
  return (
    <Card className={cn('overflow-hidden', pending && 'ring-2 ring-accent')}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-5 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Link to={`/tournaments/${a.tournament.id}`} className="font-bold hover:text-primary hover:underline">{a.tournament.name}</Link>
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

const fmt = (key: string, v: number | null) =>
  v === null ? null : key === 'agreement' ? `${Math.round(v * 100)}%` : key === 'feedbackAvg' || key === 'organizer' ? v.toFixed(1) : String(v)

// level, stats and what is missing for the next level
function LevelCard({ p }: { p: JudgeProfile }) {
  const { t } = useTranslation()
  const s = p.stats
  const stats = [
    { label: t('judgeProfile.stats.debates'), value: s.debates },
    { label: t('judgeProfile.stats.tournaments'), value: s.tournaments },
    { label: t('judgeProfile.stats.agreement'), value: fmt('agreement', s.agreement) ?? '—' },
    { label: t('judgeProfile.stats.feedback', { count: s.feedbackCount }), value: fmt('feedbackAvg', s.feedbackAvg) ?? '—' },
    { label: t('judgeProfile.stats.organizer', { count: s.organizerCount }), value: fmt('organizer', s.organizerAvg) ?? '—' },
  ]
  return (
    <Card className="mt-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">{t('judgeProfile.yourLevel')}</p>
        <LevelBadge level={p.level} className="px-3 py-1 text-sm" />
        {p.level !== p.earnedLevel && <p className="w-full text-xs text-muted-foreground">{t('judgeProfile.setByAdmin', { level: t(`judgeLevel.${p.earnedLevel}`) })}</p>}
      </div>
      <div>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map(x => (
            <div key={x.label}>
              <dt className="text-xs text-muted-foreground">{x.label}</dt>
              <dd className="mt-1 text-xl font-extrabold tabular-nums">{x.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {p.next ? (
        <div className="mt-6 border-t border-border pt-5">
          <p className="text-sm font-semibold">{t('judgeProfile.toNext')} <LevelBadge level={p.next.level} className="ml-1" /></p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {p.next.checks.map(c => (
              <li key={c.key} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className={cn('mt-0.5 size-4 shrink-0', c.met ? 'text-success' : 'text-border')} />
                <span className={cn(c.met && 'text-muted-foreground')}>
                  {t(`judgeProfile.check.${c.key}`, { required: fmt(c.key, c.required), current: fmt(c.key, c.current) ?? t('judgeProfile.noData') })}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">{t('judgeProfile.privacy')}</p>
        </div>
      ) : <p className="mt-5 text-sm font-semibold text-success">{t('judgeProfile.top')}</p>}
    </Card>
  )
}

// applications sent through the judge exchange
function ApplicationsCard() {
  const { t } = useTranslation()
  const { data } = useAsync(getMyJudgeApplications)
  if (!data) return null
  const variant = { pending: 'accent', accepted: 'success', declined: 'muted', withdrawn: 'muted' } as const
  return (
    <Card className="mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold"><Megaphone className="size-5 text-primary" />{t('exchange.myTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('exchange.myText')}</p>
        </div>
        <Button asChild variant={data.length ? 'outline' : 'primary'}><Link to="/judges"><Megaphone className="size-4" />{t('exchange.open')}</Link></Button>
      </div>
      {data.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {data.map(a => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <Link to={`/tournaments/${a.tournament.id}`} className="min-w-0 font-semibold hover:text-primary">
                {a.tournament.name}
                <span className="block text-xs font-normal text-muted-foreground">{formatDate(a.tournament.startDate)} · {a.tournament.city}</span>
              </Link>
              <Badge variant={variant[a.status]}>{t(`exchange.status.${a.status}`)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export default function JudgeDashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data, loading, error, reload } = useAsync(getJudgeAssignments, [user?.id])
  const profile = useAsync(getJudgeProfile, [user?.id])
  const [tournament, setTournament] = useState('all')
  // judges who work several tournaments can narrow the list to one
  const tournaments = [...new Map((data ?? []).map(a => [a.tournament.id, a.tournament.name])).entries()]
  const shown = (data ?? []).filter(a => tournament === 'all' || a.tournament.id === tournament)

  const active = shown.filter(a => a.debate.ballotStatus !== 'confirmed')
  const history = shown.filter(a => a.debate.ballotStatus === 'confirmed')
  const pending = active.filter(a => a.debate.ballotStatus === 'pending').length

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6">
      <CabinetHeader title={t('judge.title')} subtitle={t('judge.subtitle')} />
      {profile.data ? <LevelCard p={profile.data} /> : !profile.error && <Skeleton className="mt-6 h-44" />}
      <ApplicationsCard />

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
