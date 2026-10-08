import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Clock, DoorOpen, Eye, Gavel, Medal, PenLine, Scale, Trophy, UserX } from 'lucide-react'
import type { BallotData, PanelBallot } from '@/api'
import { cn, formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { BackButton } from '@/components/layout/BackButton'
import { BP_POINTS, sidesOf, useSides } from '@/lib/formats'
import { quoted } from '@/lib/motion'

// What organizers and admins see instead of the form: every judge's ballot as it was sent, read-only.
// Tournament rules: only the judges decide; the organizer follows who has voted and reads the scores.
// British Parliamentary: the panel confers and the chair sends the one ballot, so only the chair's ballot is shown.
export function BallotReview({ data }: { data: BallotData }) {
  const { t } = useTranslation()
  const bp = data.rules?.teams === 4
  const panel = (data.panel ?? []).filter(p => !bp || p.isChair)
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
        <p className="mt-3 text-lg font-bold leading-snug sm:text-xl">
          {sidesOf(data.rules?.format).map(side => data[side]?.name).filter(Boolean).join(bp ? ' · ' : ' vs ')}
        </p>
        {data.round.motion && <p className="mt-1 text-sm text-white/80">{quoted(data.round.motion)}</p>}
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-2xl bg-primary-soft p-4 text-sm">
        <Eye className="mt-0.5 size-4 shrink-0 text-primary" />{t(bp ? 'ballot.review.bpReadOnly' : 'ballot.review.readOnly')}
      </p>
      {!bp && <Decision data={data} panel={panel} />}
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

// The result of the debate in one line: who won and how the panel voted (a split is decided by the chair), and a
// warning when the judges saw the debate very differently, so the organizer can talk to them before the round ends.
function Decision({ data, panel }: { data: BallotData; panel: PanelBallot[] }) {
  const { t } = useTranslation()
  const sides = useSides(data.rules?.format)
  const voted = panel.filter(p => p.winner && p.totals)
  if (!data.debate.winner || voted.length < panel.length || !voted.length) return null
  const winner = data.debate.winner
  const loser = winner === 'proposition' ? 'opposition' : 'proposition'
  const forWinner = voted.filter(p => p.winner === winner).length
  const chair = panel.find(p => p.isChair)
  const byChair = forWinner * 2 === voted.length
  // margins seen by each judge (proposition minus opposition); far apart = the judges disagree strongly
  const margins = voted.map(p => (p.totals!.proposition ?? 0) - (p.totals!.opposition ?? 0))
  const spread = Math.max(...margins) - Math.min(...margins)
  const [min, max] = data.rules?.speaker ?? [60, 80]
  const strong = voted.length > 1 && spread >= max - min
  const team = data[winner]?.name ?? sides[winner]
  return (
    <div className="mt-4 space-y-2">
      <p className="flex items-start gap-2 rounded-2xl border-2 border-success bg-success-soft/40 p-4 text-sm">
        <Trophy className="mt-0.5 size-4 shrink-0 text-success" />
        <span>
          <b>{t('ballot.review.decision', { team })}</b>{' '}
          {voted.length === 1 ? t('ballot.review.single')
            : byChair ? t('ballot.review.splitChair', { votes: `${forWinner}:${voted.length - forWinner}`, chair: chair?.name ?? '' })
              : forWinner === voted.length ? t('ballot.review.unanimous', { votes: `${forWinner}:0` })
                : t('ballot.review.majority', { votes: `${forWinner}:${voted.length - forWinner}`, loser: data[loser]?.name ?? sides[loser] })}
        </span>
      </p>
      {strong && (
        <p className="flex items-start gap-2 rounded-2xl bg-accent-soft p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span><Scale className="mr-1 inline size-4" />{t('ballot.review.disagreement', { count: Math.round(spread * 10) / 10 })}</span>
        </p>
      )}
    </div>
  )
}

function JudgeBallot({ p, data }: { p: PanelBallot; data: BallotData }) {
  const { t } = useTranslation()
  const sides = useSides(data.rules?.format)
  const replyWord = t(data.rules?.format === 'APF' ? 'ballot.rebuttal' : 'ballot.reply')
  const sideList = sidesOf(data.rules?.format)
  const bp = sideList.length === 4
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <p className="flex items-center gap-2 font-bold"><Gavel className="size-4 text-primary" />{p.name}
          <span className="text-xs font-normal text-muted-foreground">· {p.isChair ? t('notifications.chair') : t('notifications.wing')}</span>
        </p>
        <span className="flex flex-wrap items-center gap-2">
        {p.enteredBy && <Badge variant="accent"><PenLine className="size-3" />{t('ballot.review.enteredBy', { name: p.enteredBy })}</Badge>}
        {data.canCorrect && (
          <Button asChild size="sm" variant="outline">
            <Link to={`/ballot/${data.debate.id}?as=${p.judgeId}`}><PenLine className="size-3.5" />{t(p.submittedAt ? 'ballot.review.correct' : 'ballot.review.enter')}</Link>
          </Button>
        )}
        {p.submittedAt
          ? <Badge variant="success"><CheckCircle2 className="size-3" />{t('ballot.review.sent', { time: formatDateTime(p.submittedAt) })}</Badge>
          : p.hasAccount
            ? <Badge variant="outline"><Clock className="size-3" />{t('dashboard.ballots.pending')}</Badge>
            : <Badge variant="danger"><UserX className="size-3" />{t('ballot.review.noAccount')}</Badge>}
        </span>
      </div>
      {p.scores && p.totals && (
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          {sideList.map(side => {
            const place = p.ranking ? p.ranking.indexOf(side) + 1 : 0
            return (
            <div key={side} className={cn('rounded-xl border-2 p-3', p.winner === side ? 'border-success bg-success-soft/40' : 'border-border')}>
              <p className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <span>{sides[side]}</span>
                {bp && place > 0
                  ? <span className={cn('flex items-center gap-1', place === 1 && 'text-success')}><Medal className="size-3.5" />{t('ballot.placeN', { n: place })} · {t('ballot.teamPoints', { count: BP_POINTS[place - 1] })}</span>
                  : p.winner === side && <span className="flex items-center gap-1 text-success"><Trophy className="size-3.5" />{t('ballot.review.winner')}</span>}
              </p>
              <p className="mt-0.5 font-extrabold">{data[side]?.name}</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {p.scores!.filter(s => s.side === side).map(s => (
                  <li key={`${s.position}-${s.speaker}`}>
                    <div className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{s.position === 4 ? `${replyWord}: ${s.speaker}` : `${s.position}. ${s.speaker}`}</span>
                      <b className="tabular-nums">{s.score}</b>
                    </div>
                    {s.feedback && <p className="mt-0.5 text-xs italic text-muted-foreground">«{s.feedback}»</p>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-bold"><span>{t('ballot.total')}</span><span className="tabular-nums">{(p.totals![side] ?? 0).toFixed((data.rules?.step ?? 0.5) < 1 ? 1 : 0)}</span></p>
            </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
