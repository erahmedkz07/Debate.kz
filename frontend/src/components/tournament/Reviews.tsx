import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Gavel, Loader2, MessageSquare, Star, User } from 'lucide-react'
import { getTournamentReviews, sendTournamentReview } from '@/api'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import { Stars } from './JudgeFeedback'

// Reviews of a finished tournament: the average and how the scores spread, the organizer's average across their
// tournaments, comments without names (only "speaker" / "judge"), and the form for those who took part.
export function ReviewsTab({ id }: { id: string }) {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => getTournamentReviews(id), [id])
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data?.mine) { setScore(data.mine.score); setComment(data.mine.comment ?? '') } }, [data?.mine])
  if (error) return <ErrorState onRetry={reload} />
  if (loading || !data) return <Skeleton className="h-64" />
  const send = async () => {
    setBusy(true)
    try { await sendTournamentReview(id, score, comment.trim() || undefined); toast.success(t('reviews.thanks')); reload() } catch (e) { toast.error(errorMessage(e, t)) } finally { setBusy(false) }
  }
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card className="p-6 text-center">
          <p className="text-5xl font-extrabold">{data.average ?? '—'}</p>
          <div className="mt-2 flex justify-center"><Stars value={Math.round(data.average ?? 0)} size="size-5" /></div>
          <p className="mt-1 text-sm text-muted-foreground">{t('reviews.count', { count: data.count })}</p>
          <ul className="mt-4 space-y-1.5">
            {data.spread.map((n, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="flex w-8 shrink-0 items-center gap-0.5 font-semibold">{5 - i}<Star className="size-3 fill-accent text-accent" /></span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${data.count ? (n / data.count) * 100 : 0}%` }} />
                </span>
                <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{n}</span>
              </li>
            ))}
          </ul>
        </Card>
        {data.organizer.count > 0 && (
          <Card className="p-4 text-sm">
            <p className="font-semibold">{t('reviews.organizer')}</p>
            <p className="mt-1 flex items-center gap-2"><Stars value={Math.round(data.organizer.average ?? 0)} size="size-4" /><b>{data.organizer.average}</b>
              <span className="text-muted-foreground">· {t('reviews.count', { count: data.organizer.count })}</span></p>
          </Card>
        )}
      </div>
      <div className="space-y-4">
        {data.canReview && (
          <Card className="p-5">
            <p className="font-bold">{data.mine ? t('reviews.yours') : t('reviews.ask')}</p>
            <p className="text-sm text-muted-foreground">{t('reviews.askText')}</p>
            <div className="mt-3"><Stars value={score} onChange={setScore} label={t('reviews.ask')} /></div>
            <Textarea className="mt-3" rows={3} maxLength={1000} value={comment} onChange={e => setComment(e.target.value)} placeholder={t('reviews.placeholder')} aria-label={t('reviews.placeholder')} />
            <div className="mt-3 flex justify-end">
              <Button disabled={busy || !score} onClick={send}>{busy && <Loader2 className="size-4 animate-spin" />}{data.mine ? t('reviews.update') : t('reviews.send')}</Button>
            </div>
          </Card>
        )}
        {data.items.length === 0 ? <EmptyState icon={<MessageSquare className="size-7" />} title={t('reviews.empty')} /> : (
          <ul className="space-y-3">
            {data.items.map(r => (
              <li key={r.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="outline">{r.role === 'judge' ? <Gavel className="size-3" /> : <User className="size-3" />}{t(`reviews.roles.${r.role}`)}</Badge>
                    <span className="flex items-center gap-2"><Stars value={r.score} size="size-4" /><span className="text-xs text-muted-foreground">{formatDate(r.createdAt.slice(0, 10))}</span></span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed">{r.comment}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
