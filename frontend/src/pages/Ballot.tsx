import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { AlertCircle, ArrowLeft, CheckCircle2, CloudOff, CloudUpload, DoorOpen, Loader2, Minus, Plus, Timer, Trophy, X } from 'lucide-react'
import { getBallot, NotFoundError, submitBallot } from '@/api'
import type { Team } from '@/types'
import { useAsync } from '@/lib/hooks'
import { useAuth } from '@/lib/auth'
import {
  clearBallotDraft, dropBallot, isRetryable, loadBallotDraft, loadBallotSheet, OUTBOX_EVENT, queueBallot, queuedBallot, saveBallotDraft, saveBallotSheet,
} from '@/lib/ballotOutbox'
import { errorMessage } from '@/lib/errors'
import { cn, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { ErrorState, Skeleton } from '@/components/ui/states'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/input'
import { BackButton } from '@/components/layout/BackButton'
import { BallotReview } from '@/components/ballot/BallotReview'
import { SpeechTimer } from '@/components/tools/SpeechTimer'
import { formatOfTournament } from '@/content/formats'
import NotFound from './NotFound'

type Side = 'proposition' | 'opposition'
type Range = { min: number; max: number; step: number }

// the sheet comes from the API; without a network the copy saved on the last visit is used
async function loadSheet(debateId: string, userId: string) {
  try {
    const sheet = await getBallot(debateId)
    saveBallotSheet(debateId, userId, sheet)
    return { sheet, cached: false }
  } catch (e) {
    const sheet = isRetryable(e) ? loadBallotSheet(debateId, userId) : null
    if (sheet) return { sheet, cached: true }
    throw e
  }
}

// optional written comment to a speaker; hidden behind a small link so the ballot stays compact
function FeedbackField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(!!value)
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="mb-2 cursor-pointer text-xs font-semibold text-primary hover:underline">+ {t('ballot.addFeedback')}</button>
  }
  return (
    <div className="mb-3">
      <Textarea rows={2} maxLength={400} value={value} onChange={e => onChange(e.target.value)} placeholder={t('ballot.feedbackPlaceholder')} aria-label={label} className="text-sm" />
      <p className="mt-1 text-right text-[11px] text-muted-foreground tabular-nums">{value.length}/400</p>
    </div>
  )
}

function ScoreInput({ label, value, onChange, range, invalid }: { label: string; value: string; onChange: (v: string) => void; range: Range; invalid: boolean }) {
  const bump = (d: number) => {
    const n = value === '' ? (range.min + range.max) / 2 : Number(value) + d
    onChange(String(Math.min(range.max, Math.max(range.min, n))))
  }
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-0 truncate text-sm font-medium">{label}</span>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => bump(-range.step)} className="grid size-9 cursor-pointer place-items-center rounded-lg bg-muted hover:bg-border" aria-label="-"><Minus className="size-4" /></button>
        <input
          inputMode="decimal" value={value} onChange={e => onChange(e.target.value.replace(',', '.'))} aria-label={label} aria-invalid={invalid}
          placeholder={`${range.min}–${range.max}`}
          className={cn('h-9 w-16 rounded-lg border-2 bg-card text-center text-sm font-bold tabular-nums focus:outline-none focus:ring-4 focus:ring-primary/15',
            invalid ? 'border-danger' : 'border-border focus:border-primary')}
        />
        <button type="button" onClick={() => bump(range.step)} className="grid size-9 cursor-pointer place-items-center rounded-lg bg-muted hover:bg-border" aria-label="+"><Plus className="size-4" /></button>
      </div>
    </div>
  )
}

export default function Ballot() {
  const { debateId = '' } = useParams()
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const { user } = useAuth()
  // the page is behind RequireAuth, so there is always a user here
  const uid = user?.id ?? ''
  const { data: loaded, loading, error, reload } = useAsync(() => loadSheet(debateId, uid), [debateId, uid])
  const data = loaded?.sheet
  // everything typed is kept on the device until the ballot is accepted: a reload or a dropped connection loses nothing
  const [draft] = useState(() => loadBallotDraft(debateId, uid))
  const [scores, setScores] = useState<Record<string, string>>(draft?.scores ?? {})
  // speakerId (substantive) or "reply:<side>" -> comment
  const [feedback, setFeedback] = useState<Record<string, string>>(draft?.feedback ?? {})
  const [reply, setReply] = useState<Record<Side, string>>(draft?.reply ?? { proposition: '', opposition: '' })
  const [replyBy, setReplyBy] = useState<Partial<Record<Side, string>>>(draft?.replyBy ?? {})
  const [winner, setWinner] = useState<Side | null>(draft?.winner ?? null)
  const [tried, setTried] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<false | 'sent' | 'queued'>(false)
  const [queued, setQueued] = useState(() => queuedBallot(debateId, uid))
  // the speech timer opens as a side panel on the ballot: nothing typed is lost, and it keeps running when hidden
  const [timer, setTimer] = useState<'closed' | 'open' | 'hidden'>('closed')
  const navigate = useNavigate()
  // back to where the judge came from (their cabinet, a notification…); opened from a link, to the judge's cabinet
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/judge')
  }

  useEffect(() => {
    const touched = Object.values(scores).some(Boolean) || Object.values(feedback).some(Boolean) || !!reply.proposition || !!reply.opposition || !!winner
    if (touched && !done) saveBallotDraft(debateId, uid, { scores, feedback, reply, replyBy, winner })
  }, [debateId, uid, scores, feedback, reply, replyBy, winner, done])
  useEffect(() => {
    const sync = () => setQueued(queuedBallot(debateId, uid))
    sync()
    window.addEventListener(OUTBOX_EVENT, sync)
    return () => window.removeEventListener(OUTBOX_EVENT, sync)
  }, [debateId, user?.id])

  const inRange = (v: string, r: Range) => v !== '' && !isNaN(Number(v)) && Number(v) >= r.min && Number(v) <= r.max && Math.abs(Number(v) / r.step - Math.round(Number(v) / r.step)) < 1e-9

  const totals = useMemo(() => {
    if (!data) return { proposition: 0, opposition: 0 }
    const sum = (team: Team, side: Side) =>
      team.speakers.reduce((s, sp) => s + (Number(scores[sp.id]) || 0), 0) + (Number(reply[side]) || 0)
    return { proposition: sum(data.proposition, 'proposition'), opposition: sum(data.opposition, 'opposition') }
  }, [data, scores, reply])

  if (error instanceof NotFoundError) return <NotFound />
  if (error) return <div className="container-page py-20"><ErrorState onRetry={reload} /></div>
  if (loading || !data) {
    return <div className="container-page max-w-3xl space-y-4 py-10"><Skeleton className="h-32" /><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
  }

  // organizers and admins read the ballots; only the judges of the debate fill them in
  if (data.canSubmit === false) return <BallotReview data={data} />

  // the tournament's format: team size, score ranges and whether there are reply speeches (WSDC 60–80/30–40 by default)
  const rules = data.rules ?? { format: 'WSDC', speakers: 3, step: 0.5, speaker: [60, 80] as [number, number], reply: { range: [30, 40] as [number, number], by: [1, 2] } }
  const SPEAKER: Range = { min: rules.speaker[0], max: rules.speaker[1], step: rules.step }
  const REPLY: Range | null = rules.reply ? { min: rules.reply.range[0], max: rules.reply.range[1], step: rules.step } : null
  const format = formatOfTournament(rules.format)
  const sideName = (side: Side) => format.sides[side === 'proposition' ? 0 : 1][lang]
  const allSpeakers = [...data.proposition.speakers, ...data.opposition.speakers]
  const complete = allSpeakers.every(s => inRange(scores[s.id] ?? '', SPEAKER)) && (!REPLY || (inRange(reply.proposition, REPLY) && inRange(reply.opposition, REPLY)))
  const higher: Side | null = totals.proposition === totals.opposition ? null : totals.proposition > totals.opposition ? 'proposition' : 'opposition'
  const errors: string[] = []
  if (!complete) errors.push(t('ballot.errors.incomplete'))
  else if (!higher) errors.push(t('ballot.errors.tie'))
  if (!winner) errors.push(t('ballot.errors.winnerRequired'))
  else if (complete && higher && winner !== higher) errors.push(t('ballot.errors.winnerMismatch'))

  const onSubmit = () => {
    setTried(true)
    if (errors.length) return
    setConfirm(true)
  }
  const send = async () => {
    setSending(true)
    const payload = {
      winner: winner!,
      ...(REPLY && {
        replySpeakers: {
          proposition: replyBy.proposition ?? data.proposition.speakers[0].id,
          opposition: replyBy.opposition ?? data.opposition.speakers[0].id,
        },
      }),
      scores: Object.fromEntries(allSpeakers.map(s => [s.id, Number(scores[s.id])])),
      ...(REPLY && { reply: { proposition: Number(reply.proposition), opposition: Number(reply.opposition) } }),
      feedback: Object.fromEntries(Object.entries(feedback).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)),
    }
    try {
      await submitBallot(debateId, payload)
      // an older copy waiting in the queue must not overwrite this one later
      dropBallot(debateId, uid)
      clearBallotDraft(debateId, uid)
      setConfirm(false)
      setDone('sent')
      toast.success(t('ballot.success'))
    } catch (e) {
      if (isRetryable(e) && user) {
        // no connection: keep it on the device, OfflineSync sends it when the network is back
        queueBallot({ debateId, userId: user.id, label: `${data.tournament.name} · ${t('ballot.round', { n: data.round.number })} · ${data.debate.room}`, payload })
        setConfirm(false)
        setDone('queued')
      } else {
        // the server re-validates every WSDC rule; show its verdict
        toast.error(errorMessage(e, t))
      }
    } finally {
      setSending(false)
    }
  }

  if (done) {
    return (
      <div className="container-page grid min-h-[60vh] max-w-lg place-items-center py-16 text-center">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          {done === 'queued' ? (
            <>
              <span className="mx-auto grid size-20 place-items-center rounded-full bg-accent-soft text-navy dark:text-accent"><CloudUpload className="size-10" /></span>
              <h1 className="mt-6 text-3xl font-extrabold">{t('offline.queuedTitle')}</h1>
              <p className="mt-2 text-muted-foreground">{t('offline.queuedText')}</p>
            </>
          ) : (
            <>
              <span className="mx-auto grid size-20 place-items-center rounded-full bg-success-soft text-success"><CheckCircle2 className="size-10" /></span>
              <h1 className="mt-6 text-3xl font-extrabold">{t('ballot.done')}</h1>
              <p className="mt-2 text-muted-foreground">{t('ballot.doneText')}</p>
            </>
          )}
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" onClick={goBack}><ArrowLeft className="size-4" />{t('ballot.goBack')}</Button>
            <Button asChild size="lg" variant="outline"><Link to={`/tournaments/${data.tournament.id}`}>{t('ballot.backToTournament')}</Link></Button>
          </div>
        </motion.div>
      </div>
    )
  }

  const teamCard = (side: Side, team: Team) => {
    // who may give the reply: WSDC the 1st or 2nd speaker, APF the leader
    const replyOptions = team.speakers.filter((_, i) => rules.reply?.by.includes(i + 1))
    return (
      <Card className={cn('overflow-hidden transition-shadow', winner === side && 'ring-2 ring-success')}>
        <div className={cn('flex items-center justify-between px-5 py-3.5', side === 'proposition' ? 'bg-primary text-primary-foreground' : 'bg-navy text-white')}>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">{sideName(side)}</p>
            <p className="text-lg font-extrabold">{team.name}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">{t('ballot.total')}</p>
            <p className="text-2xl font-extrabold tabular-nums">{totals[side].toFixed(1)}</p>
          </div>
        </div>
        <div className="divide-y divide-border px-5">
          {team.speakers.map((s, i) => (
            <div key={s.id}>
              <ScoreInput label={`${i + 1}. ${s.name}`} value={scores[s.id] ?? ''} range={SPEAKER}
                invalid={tried && !inRange(scores[s.id] ?? '', SPEAKER)} onChange={v => setScores(p => ({ ...p, [s.id]: v }))} />
              <FeedbackField label={t('ballot.feedbackFor', { name: s.name })} value={feedback[s.id] ?? ''} onChange={v => setFeedback(p => ({ ...p, [s.id]: v }))} />
            </div>
          ))}
          {REPLY && replyOptions.length > 0 && (
          <div className="py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-primary">{t(rules.format === 'APF' ? 'ballot.rebuttal' : 'ballot.reply')}</span>
              <div className="w-40">
                <Select size="sm" aria-label={t('ballot.replySpeaker')} value={replyBy[side] ?? replyOptions[0].id}
                  onValueChange={v => setReplyBy(p => ({ ...p, [side]: v }))}
                  options={replyOptions.map(s => ({ value: s.id, label: s.name }))} />
              </div>
            </div>
            <ScoreInput label={team.speakers.find(s => s.id === (replyBy[side] ?? replyOptions[0].id))!.name} value={reply[side]} range={REPLY!} invalid={tried && !inRange(reply[side], REPLY!)} onChange={v => setReply(p => ({ ...p, [side]: v }))} />
            <FeedbackField label={t('ballot.feedbackReply')} value={feedback[`reply:${side}`] ?? ''} onChange={v => setFeedback(p => ({ ...p, [`reply:${side}`]: v }))} />
          </div>
          )}
        </div>
      </Card>
    )
  }

  return (
    <div className="container-page max-w-3xl py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackButton fallback="/judge" label={data.tournament.name} className="-ml-1" />
        <button type="button" onClick={() => setTimer(v => (v === 'open' ? 'hidden' : 'open'))} aria-pressed={timer === 'open'}
          className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-primary-soft">
          <Timer className="size-4" />{t('timer.title')}
        </button>
      </div>
      {loaded?.cached && (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-2xl bg-accent-soft p-4 text-sm"><CloudOff className="mt-0.5 size-4 shrink-0" />{t('offline.cachedSheet')}</p>
      )}
      {queued && (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-2xl bg-primary-soft p-4 text-sm"><CloudUpload className="mt-0.5 size-4 shrink-0 text-primary" />{t('offline.queuedHere', { time: formatDateTime(queued.savedAt) })}</p>
      )}
      <div className="mt-4 rounded-2xl bg-gradient-to-br from-primary to-navy p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-navy">{t('ballot.round', { n: data.round.number })}</span>
          <span className="flex items-center gap-1.5 text-white/80"><DoorOpen className="size-4" />{data.debate.room}</span>
        </div>
        <h1 className="mt-3 text-xs font-bold uppercase tracking-wider text-white/70">{t('ballot.title')} · {t('ballot.motion')}</h1>
        <p className="mt-1 text-lg font-bold leading-snug sm:text-xl">«{data.round.motion}»</p>
        <p className="mt-3 text-xs text-white/70">
          {format.name[lang]} · {t('ballot.speakerRange', { min: SPEAKER.min, max: SPEAKER.max })}{REPLY && ` · ${t(rules.format === 'APF' ? 'ballot.rebuttalRange' : 'ballot.replyRange', { min: REPLY.min, max: REPLY.max })}`}
        </p>
      </div>

      <div className="mt-6 space-y-5">
        {teamCard('proposition', data.proposition)}
        {teamCard('opposition', data.opposition)}
      </div>

      <Card className="mt-5 p-5">
        <p className="font-bold">{t('ballot.winner')}</p>
        <p className="text-sm text-muted-foreground">{t('ballot.chooseWinner')}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {(['proposition', 'opposition'] as const).map(side => {
            const team = side === 'proposition' ? data.proposition : data.opposition
            return (
              <button key={side} type="button" onClick={() => setWinner(side)} aria-pressed={winner === side}
                className={cn('flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 p-4 transition-all',
                  winner === side ? 'border-success bg-success-soft' : 'border-border hover:border-primary/40')}>
                <Trophy className={cn('size-6', winner === side ? 'text-success' : 'text-muted-foreground')} />
                <span className="text-xs text-muted-foreground">{sideName(side)}</span>
                <span className="font-extrabold">{team.name}</span>
              </button>
            )
          })}
        </div>
      </Card>

      {tried && errors.length > 0 && (
        <div role="alert" className="mt-5 space-y-1.5 rounded-2xl bg-danger-soft p-4 text-sm font-medium text-danger">
          {errors.map(e => <p key={e} className="flex items-start gap-2"><AlertCircle className="mt-0.5 size-4 shrink-0" />{e}</p>)}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 mt-6 border-t border-border bg-background/90 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button size="lg" className="w-full" onClick={onSubmit}>{t('ballot.submit')}</Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">{t('offline.draftHint')}</p>
      </div>

      {/* the timer panel: mounted on first open, then only hidden, so a running speech keeps its time */}
      {timer !== 'closed' && (
        <aside aria-label={t('timer.title')}
          className={cn('fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-border bg-background p-4 shadow-2xl sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-[26rem] sm:rounded-none sm:rounded-l-3xl sm:p-5',
            timer === 'hidden' && 'hidden')}>
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 font-bold"><Timer className="size-4 text-primary" />{t('timer.title')}</p>
            <button type="button" onClick={() => setTimer('hidden')} aria-label={t('common.close')}
              className="grid size-9 cursor-pointer place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
          </div>
          <SpeechTimer formatId={format.id} compact active={timer === 'open'} />
        </aside>
      )}

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent heading={t('ballot.confirmTitle')} description={t('ballot.confirmText')}>
          <div className="rounded-xl bg-muted p-4 text-sm">
            <p className="flex justify-between"><span>{data.proposition.name}</span><b className="tabular-nums">{totals.proposition.toFixed(1)}</b></p>
            <p className="mt-1 flex justify-between"><span>{data.opposition.name}</span><b className="tabular-nums">{totals.opposition.toFixed(1)}</b></p>
            <p className="mt-3 flex items-center gap-2 border-t border-border pt-3 font-bold text-success">
              <Trophy className="size-4" />{winner && (winner === 'proposition' ? data.proposition.name : data.opposition.name)}
            </p>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button onClick={send} disabled={sending}>{sending && <Loader2 className="size-4 animate-spin" />}{t('ballot.confirm')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
