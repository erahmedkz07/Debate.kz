import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Award, Gavel, Loader2, Medal, Mic } from 'lucide-react'
import { useState } from 'react'
import { getAwardCandidates, setTournamentAward, type AwardKind } from '@/api'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/states'
import { Stars } from './JudgeFeedback'

// Best speaker and best judge: the site suggests (the speaker tab; the speakers' ratings of judges),
// the organizer picks with one click. The diplomas are issued when the tournament finishes (at once if it already has).
export function AwardsCard({ id, finished, onChange }: { id: string; finished: boolean; onChange?: () => void }) {
  const { t } = useTranslation()
  const { data, loading, reload } = useAsync(() => getAwardCandidates(id), [id])
  const [busy, setBusy] = useState<string | null>(null)
  if (loading || !data) return <Skeleton className="h-40" />
  const pick = async (kind: AwardKind, personId: string | null) => {
    setBusy(`${kind}:${personId}`)
    try {
      await setTournamentAward(id, kind, personId)
      toast.success(personId ? t(finished ? 'awards.issued' : 'awards.saved') : t('awards.removed'))
      reload()
      onChange?.()
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(null)
    }
  }
  const chosenSpeaker = data.chosen.best_speaker?.speakerId
  const chosenJudge = data.chosen.best_judge?.judgeId
  const option = (kind: AwardKind, pid: string, chosen: boolean, title: string, sub: React.ReactNode) => (
    <button key={pid} type="button" aria-pressed={chosen} disabled={!!busy} onClick={() => pick(kind, chosen ? null : pid)}
      className={cn('flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-60',
        chosen ? 'border-accent bg-accent-soft' : 'border-border hover:border-primary/40')}>
      {busy === `${kind}:${chosen ? null : pid}` ? <Loader2 className="size-5 shrink-0 animate-spin" /> : <Medal className={cn('size-5 shrink-0', chosen ? 'text-navy dark:text-accent' : 'text-muted-foreground')} />}
      <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{title}</span><span className="block text-xs text-muted-foreground">{sub}</span></span>
      {chosen && <span className="text-xs font-bold">{t('awards.chosen')}</span>}
    </button>
  )
  return (
    <Card className="mb-5 p-5">
      <p className="flex items-center gap-2 font-bold"><Award className="size-5 text-primary" />{t('awards.title')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t(finished ? 'awards.hintFinished' : 'awards.hint')}</p>
      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold"><Mic className="size-4" />{t('awards.bestSpeaker')}</p>
          {data.speakers.length === 0 ? <p className="text-sm text-muted-foreground">{t('awards.noSpeakers')}</p> : (
            <div className="space-y-2">
              {data.speakers.map(s => option('best_speaker', s.id, s.id === chosenSpeaker, s.name,
                t('awards.speakerStats', { team: s.team, total: s.total, average: s.average, rounds: s.rounds })))}
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{t('awards.speakerRule')}</p>
        </section>
        <section>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold"><Gavel className="size-4" />{t('awards.bestJudge')}</p>
          {data.judges.length === 0 ? <p className="text-sm text-muted-foreground">{t('awards.noJudges', { min: data.minReviews })}</p> : (
            <div className="space-y-2">
              {data.judges.map(j => option('best_judge', j.id, j.id === chosenJudge, j.name,
                <span className="inline-flex items-center gap-1.5"><Stars value={Math.round(j.average ?? 0)} size="size-3" />{j.average} · {t('feedback.count', { count: j.reviews })}</span>))}
            </div>
          )}
          {data.otherJudges.length > 0 && (
            <div className="mt-2">
              <Select size="sm" value={data.otherJudges.some(j => j.id === chosenJudge) ? chosenJudge : ''} placeholder={t('awards.otherJudge')} aria-label={t('awards.otherJudge')}
                onValueChange={v => pick('best_judge', v)} options={data.otherJudges.map(j => ({ value: j.id, label: `${j.name}${j.reviews ? ` · ${j.average} (${j.reviews})` : ''}` }))} />
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{t('awards.judgeRule', { min: data.minReviews })}</p>
        </section>
      </div>
    </Card>
  )
}
