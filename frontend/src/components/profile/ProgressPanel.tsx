import { useTranslation } from 'react-i18next'
import { Award, MessageSquareQuote, Mic, TrendingDown, TrendingUp } from 'lucide-react'
import { getProgress } from '@/api'
import { useAsync } from '@/lib/hooks'
import { cn, formatDate } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import { DotScale, ScoreLine } from '@/components/charts/ScoreLine'

const SPEECH: [number, number] = [60, 80] // WSDC substantive speech scale

// A speaker's growth: scores per speech, averages by position and topic, and the judges' written comments
export function ProgressPanel() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(getProgress)
  if (error) return <ErrorState onRetry={reload} />
  if (loading || !data) return <Skeleton className="h-96" />
  const s = data.summary
  if (!s.speeches) return <EmptyState icon={<TrendingUp className="size-7" />} title={t('progress.empty')} text={t('progress.emptyText')} />

  const position = (p: number) => (p === 4 ? t('progress.reply') : t('progress.position', { n: p }))
  const tiles = [
    { label: t('progress.speeches'), value: String(s.speeches), icon: Mic },
    { label: t('progress.average'), value: s.average?.toFixed(1) ?? '—', icon: Award },
    { label: t('progress.best'), value: s.best?.toFixed(1) ?? '—', icon: Award },
    {
      label: t('progress.trend'), icon: s.trend !== null && s.trend < 0 ? TrendingDown : TrendingUp,
      value: s.trend === null ? '—' : `${s.trend > 0 ? '+' : ''}${s.trend.toFixed(1)}`,
    },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-5">
            <Icon className="size-5 text-primary" />
            <p className="mt-3 text-3xl font-extrabold tabular-nums">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </Card>
        ))}
      </div>
      {s.trend !== null && <p className="text-xs text-muted-foreground">{t('progress.trendHint')}</p>}

      <Card className="p-6">
        <h3 className="font-bold">{t('progress.chartTitle')}</h3>
        <p className="mb-4 text-xs text-muted-foreground">{t('progress.chartHint')}</p>
        {data.timeline.length >= 2 ? (
          <ScoreLine label={t('progress.chartTitle')} domain={SPEECH}
            points={data.timeline.map(p => ({ value: p.score, title: `${p.tournament} · ${p.round}`, subtitle: `${position(p.position)} · ${formatDate(p.date)} · ${p.won ? t('profile.result.win') : t('profile.result.loss')}` }))} />
        ) : <p className="text-sm text-muted-foreground">{t('progress.needMore')}</p>}
        {/* the same data as a table (accessibility, exact values) */}
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold text-primary">{t('progress.table')}</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="py-2 pr-3">{t('progress.date')}</th><th className="py-2 pr-3">{t('progress.debate')}</th><th className="py-2 pr-3">{t('progress.role')}</th><th className="py-2 text-right">{t('progress.score')}</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.timeline.map((p, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 text-muted-foreground">{formatDate(p.date)}</td>
                    <td className="py-2 pr-3">{p.tournament} · {p.round}</td>
                    <td className="py-2 pr-3">{position(p.position)}</td>
                    <td className="py-2 text-right font-bold tabular-nums">{p.score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="mb-4 font-bold">{t('progress.byPosition')}</h3>
          <DotScale domain={SPEECH} empty={t('progress.noData')}
            rows={data.byPosition.map(p => ({ label: position(p.position), value: p.average, note: t('progress.speechCount', { count: p.count }) }))} />
          <p className="mt-4 text-sm">{t('progress.replyAverage')}: <b className="tabular-nums">{s.replyAverage?.toFixed(1) ?? '—'}</b> <span className="text-muted-foreground">({t('progress.replyScale')})</span></p>
        </Card>
        <Card className="p-6">
          <h3 className="mb-4 font-bold">{t('progress.byTopic')}</h3>
          {data.byTopic.length ? (
            <DotScale domain={SPEECH} empty={t('progress.noData')}
              rows={data.byTopic.slice(0, 6).map(x => ({ label: t(`motions.topics.${x.topic}`), value: x.average, note: t('progress.speechCount', { count: x.count }) }))} />
          ) : <p className="text-sm text-muted-foreground">{t('progress.noTopics')}</p>}
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="flex items-center gap-2 font-bold"><MessageSquareQuote className="size-4 text-primary" />{t('progress.comments')}</h3>
        {data.comments.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t('progress.noComments')}</p> : (
          <ul className="mt-4 space-y-3">
            {data.comments.map((c, i) => (
              <li key={i} className={cn('rounded-xl border border-border p-4')}>
                <p className="text-sm">«{c.text}»</p>
                <p className="mt-2 text-xs text-muted-foreground">{c.judge} · {position(c.position)} · {c.score.toFixed(1)} · {c.tournament}, {c.round} · {formatDate(c.date)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
