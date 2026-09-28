import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Clock, DoorOpen, Eye, Gavel, Trophy, UserX } from 'lucide-react'
import type { BallotData, PanelBallot } from '@/api'
import { cn, formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { BackButton } from '@/components/layout/BackButton'

// What organizers and admins see instead of the form: every judge's ballot as it was sent, read-only.
// Tournament rules: only the judges decide; the organizer follows who has voted and reads the scores.
export function BallotReview({ data }: { data: BallotData }) {
  const { t } = useTranslation()
  const panel = data.panel ?? []
  const sent = panel.filter(p => p.submittedAt).length
  const tid = data.tournament.id
  return (
    <div className="container-page max-w-3xl py-8">
      <BackButton fallback={`/dashboard/tournaments/${tid}/ballots`} className="-ml-1" />
      <div className="mt-2 rounded-2xl bg-gradient-to-br from-primary to-navy p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-navy">{t('ballot.round', { n: data.round.number })}</span>
          <span className="flex items-center gap-1.5 text-white/80"><DoorOpen className="size-4" />{data.debate.room}</span>
          <span className="text-white/80">{data.tournament.name}</span>
        </div>
        <p className="mt-3 text-lg font-bold leading-snug sm:text-xl">{data.proposition.name} <span className="text-white/60">vs</span> {data.opposition.name}</p>
        {data.round.motion && <p className="mt-1 text-sm text-white/80">«{data.round.motion}»</p>}
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-2xl bg-primary-soft p-4 text-sm">
        <Eye className="mt-0.5 size-4 shrink-0 text-primary" />{t('ballot.review.readOnly')}
      </p>
      <p className="mt-4 text-sm font-semibold">{t('ballot.review.progress', { sent, total: panel.length })}</p>

      <div className="mt-3 space-y-4">
        {panel.map(p => <JudgeBallot key={p.judgeId} p={p} data={data} />)}
      </div>
      {panel.some(p => !p.hasAccount) && (
        <p className="mt-4 text-sm text-muted-foreground">
          {t('ballot.review.noAccountHint')} <Link to={`/dashboard/tournaments/${tid}/judges`} className="font-semibold text-primary hover:underline">{t('ballot.review.toJudges')}</Link>
        </p>
      )}
    </div>
  )
}

function JudgeBallot({ p, data }: { p: PanelBallot; data: BallotData }) {
  const { t } = useTranslation()
  const team = (side: 'proposition' | 'opposition') => (side === 'proposition' ? data.proposition.name : data.opposition.name)
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <p className="flex items-center gap-2 font-bold"><Gavel className="size-4 text-primary" />{p.name}
          <span className="text-xs font-normal text-muted-foreground">· {p.isChair ? t('notifications.chair') : t('notifications.wing')}</span>
        </p>
        {p.submittedAt
          ? <Badge variant="success"><CheckCircle2 className="size-3" />{t('ballot.review.sent', { time: formatDateTime(p.submittedAt) })}</Badge>
          : p.hasAccount
            ? <Badge variant="outline"><Clock className="size-3" />{t('dashboard.ballots.pending')}</Badge>
            : <Badge variant="danger"><UserX className="size-3" />{t('ballot.review.noAccount')}</Badge>}
      </div>
      {p.scores && p.totals && (
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          {(['proposition', 'opposition'] as const).map(side => (
            <div key={side} className={cn('rounded-xl border-2 p-3', p.winner === side ? 'border-success bg-success-soft/40' : 'border-border')}>
              <p className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <span>{t(`tournament.${side}`)}</span>
                {p.winner === side && <span className="flex items-center gap-1 text-success"><Trophy className="size-3.5" />{t('ballot.review.winner')}</span>}
              </p>
              <p className="mt-0.5 font-extrabold">{team(side)}</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {p.scores!.filter(s => s.side === side).map(s => (
                  <li key={`${s.position}-${s.speaker}`}>
                    <div className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{s.position === 4 ? `${t('ballot.reply')}: ${s.speaker}` : `${s.position}. ${s.speaker}`}</span>
                      <b className="tabular-nums">{s.score}</b>
                    </div>
                    {s.feedback && <p className="mt-0.5 text-xs italic text-muted-foreground">«{s.feedback}»</p>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-bold"><span>{t('ballot.total')}</span><span className="tabular-nums">{p.totals![side].toFixed(1)}</span></p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
