import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2, Star } from 'lucide-react'
import { rateJudge, type MyDebate, type JudgeFeedbackSummary } from '@/api'
import { errorMessage } from '@/lib/errors'
import { cn, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'

// 1..5 stars: buttons for the speaker, read-only for the organizer
export function Stars({ value, onChange, size = 'size-6', label }: { value: number; onChange?: (v: number) => void; size?: string; label?: string }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-0.5" role={onChange ? 'radiogroup' : 'img'} aria-label={label ?? t('feedback.scoreOf', { n: value })}>
      {[1, 2, 3, 4, 5].map(n => {
        const icon = <Star className={cn(size, n <= value ? 'fill-accent text-accent' : 'text-border')} />
        return onChange
          ? <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={t('feedback.scoreOf', { n })} onClick={() => onChange(n)} className="cursor-pointer rounded p-0.5 hover:scale-110">{icon}</button>
          : <span key={n}>{icon}</span>
      })}
    </span>
  )
}

// A speaker rates the judges of their debate. Only the organizers read it; the judges do not.
export function RateJudgesDialog({ debate, open, onOpenChange, onSaved }: { debate: MyDebate; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [scores, setScores] = useState<Record<string, number>>({})
  const [comments, setComments] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setScores(Object.fromEntries(debate.judges.filter(j => j.myScore).map(j => [j.id, j.myScore!])))
    setComments(Object.fromEntries(debate.judges.map(j => [j.id, j.myComment ?? ''])))
  }, [open, debate])
  const save = async () => {
    setBusy(true)
    try {
      for (const j of debate.judges) if (scores[j.id]) await rateJudge(debate.debate.id, j.id, scores[j.id], comments[j.id]?.trim() || undefined)
      toast.success(t('feedback.saved'))
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent heading={t('feedback.title')} description={t('feedback.text')}>
        <ul className="space-y-4">
          {debate.judges.map(j => (
            <li key={j.id} className="rounded-2xl border border-border p-4">
              <p className="font-bold">{j.name} <span className="text-xs font-normal text-muted-foreground">· {j.isChair ? t('notifications.chair') : t('notifications.wing')}</span></p>
              <div className="mt-2"><Stars value={scores[j.id] ?? 0} onChange={n => setScores(s => ({ ...s, [j.id]: n }))} label={t('feedback.scoreFor', { name: j.name })} /></div>
              <Textarea className="mt-2 text-sm" rows={2} maxLength={500} value={comments[j.id] ?? ''} placeholder={t('feedback.commentPlaceholder')} aria-label={t('feedback.commentFor', { name: j.name })}
                onChange={e => setComments(c => ({ ...c, [j.id]: e.target.value }))} />
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild><Button variant="ghost">{t('common.cancel')}</Button></DialogClose>
          <Button disabled={busy || !Object.keys(scores).length} onClick={save}>{busy && <Loader2 className="size-4 animate-spin" />}{t('feedback.send')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// The organizer reads what speakers wrote about one judge
export function JudgeFeedbackDialog({ name, summary, onClose }: { name: string; summary: JudgeFeedbackSummary | null; onClose: () => void }) {
  const { t } = useTranslation()
  if (!summary) return null
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent heading={t('feedback.aboutJudge', { name })} description={t('feedback.average', { avg: summary.average, count: summary.count })}>
        <ul className="max-h-96 space-y-3 overflow-y-auto">
          {summary.items.map((x, i) => (
            <li key={i} className="rounded-xl bg-muted/50 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Stars value={x.score} size="size-4" />
                <span className="text-xs text-muted-foreground">{x.round} · {x.room} · {x.team} · {formatDateTime(x.createdAt)}</span>
              </div>
              {x.comment && <p className="mt-1.5">{x.comment}</p>}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
