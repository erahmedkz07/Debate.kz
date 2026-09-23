import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { AlertCircle, ArrowLeft, CheckCircle2, DoorOpen, Loader2, Minus, Plus, Trophy } from 'lucide-react'
import { getBallot, NotFoundError, submitBallot } from '@/api'
import type { Team } from '@/types'
import { useAsync } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { ErrorState, Skeleton } from '@/components/ui/states'
import { Select } from '@/components/ui/select'
import NotFound from './NotFound'

type Side = 'proposition' | 'opposition'
const SPEAKER = { min: 60, max: 80, step: 0.5 }
const REPLY = { min: 30, max: 40, step: 0.5 }

function ScoreInput({ label, value, onChange, range, invalid }: { label: string; value: string; onChange: (v: string) => void; range: typeof SPEAKER; invalid: boolean }) {
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
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => getBallot(debateId), [debateId])
  const [scores, setScores] = useState<Record<string, string>>({})
  const [reply, setReply] = useState<Record<Side, string>>({ proposition: '', opposition: '' })
  const [replyBy, setReplyBy] = useState<Partial<Record<Side, string>>>({})
  const [winner, setWinner] = useState<Side | null>(null)
  const [tried, setTried] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  const inRange = (v: string, r: typeof SPEAKER) => v !== '' && !isNaN(Number(v)) && Number(v) >= r.min && Number(v) <= r.max

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

  const allSpeakers = [...data.proposition.speakers, ...data.opposition.speakers]
  const complete = allSpeakers.every(s => inRange(scores[s.id] ?? '', SPEAKER)) && inRange(reply.proposition, REPLY) && inRange(reply.opposition, REPLY)
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
    await submitBallot({
      debateId, winner: winner!,
      replySpeakers: {
        proposition: replyBy.proposition ?? data.proposition.speakers[0].id,
        opposition: replyBy.opposition ?? data.opposition.speakers[0].id,
      },
      scores: Object.fromEntries([...Object.entries(scores).map(([k, v]) => [k, Number(v)]), ['reply-prop', Number(reply.proposition)], ['reply-opp', Number(reply.opposition)]]),
    })
    setSending(false)
    setConfirm(false)
    setDone(true)
    toast.success(t('ballot.success'))
  }

  if (done) {
    return (
      <div className="container-page grid min-h-[60vh] max-w-lg place-items-center py-16 text-center">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <span className="mx-auto grid size-20 place-items-center rounded-full bg-success-soft text-success"><CheckCircle2 className="size-10" /></span>
          <h1 className="mt-6 text-3xl font-extrabold">{t('ballot.done')}</h1>
          <p className="mt-2 text-muted-foreground">{t('ballot.doneText')}</p>
          <Button asChild size="lg" className="mt-8"><Link to={`/tournaments/${data.tournament.id}`}>{t('ballot.backToTournament')}</Link></Button>
        </motion.div>
      </div>
    )
  }

  const teamCard = (side: Side, team: Team) => {
    const replyOptions = team.speakers.slice(0, 2)
    return (
      <Card className={cn('overflow-hidden transition-shadow', winner === side && 'ring-2 ring-success')}>
        <div className={cn('flex items-center justify-between px-5 py-3.5', side === 'proposition' ? 'bg-primary text-primary-foreground' : 'bg-navy text-white')}>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">{t(`tournament.${side}`)}</p>
            <p className="text-lg font-extrabold">{team.name}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">{t('ballot.total')}</p>
            <p className="text-2xl font-extrabold tabular-nums">{totals[side].toFixed(1)}</p>
          </div>
        </div>
        <div className="divide-y divide-border px-5">
          {team.speakers.map((s, i) => (
            <ScoreInput key={s.id} label={`${i + 1}. ${s.name}`} value={scores[s.id] ?? ''} range={SPEAKER}
              invalid={tried && !inRange(scores[s.id] ?? '', SPEAKER)} onChange={v => setScores(p => ({ ...p, [s.id]: v }))} />
          ))}
          <div className="py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-primary">{t('ballot.reply')}</span>
              <div className="w-40">
                <Select size="sm" aria-label={t('ballot.replySpeaker')} value={replyBy[side] ?? replyOptions[0].id}
                  onValueChange={v => setReplyBy(p => ({ ...p, [side]: v }))}
                  options={replyOptions.map(s => ({ value: s.id, label: s.name }))} />
              </div>
            </div>
            <ScoreInput label={team.speakers.find(s => s.id === (replyBy[side] ?? replyOptions[0].id))!.name} value={reply[side]} range={REPLY} invalid={tried && !inRange(reply[side], REPLY)} onChange={v => setReply(p => ({ ...p, [side]: v }))} />
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="container-page max-w-3xl py-8">
      <Link to={`/tournaments/${data.tournament.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />{data.tournament.name}</Link>
      <div className="mt-4 rounded-2xl bg-gradient-to-br from-primary to-navy p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-navy">{t('ballot.round', { n: data.round.number })}</span>
          <span className="flex items-center gap-1.5 text-white/80"><DoorOpen className="size-4" />{data.debate.room}</span>
        </div>
        <h1 className="mt-3 text-xs font-bold uppercase tracking-wider text-white/70">{t('ballot.title')} · {t('ballot.motion')}</h1>
        <p className="mt-1 text-lg font-bold leading-snug sm:text-xl">«{data.round.motion}»</p>
        <p className="mt-3 text-xs text-white/70">{t('ballot.speakerRange')} · {t('ballot.replyRange')}</p>
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
                <span className="text-xs text-muted-foreground">{t(`tournament.${side}`)}</span>
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
      </div>

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
