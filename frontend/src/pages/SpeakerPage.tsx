import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Building2, Medal, Mic, Trophy, Users } from 'lucide-react'
import { getSpeakerPage, NotFoundError } from '@/api'
import { useAsync } from '@/lib/hooks'
import { quoted } from '@/lib/motion'
import { cn, formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/layout/Layout'
import { BackButton } from '@/components/layout/BackButton'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import NotFound from './NotFound'

// A speaker's page inside one tournament, for every speaker (an account is not needed): the places, and each public
// round with the side, the opponent, the result and the speech score. With an account it links to the whole career.
export default function SpeakerPage() {
  const { id = '', speakerId = '' } = useParams()
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => getSpeakerPage(id, speakerId), [id, speakerId])
  if (error instanceof NotFoundError) return <NotFound />
  if (error) return <div className="container-page py-20"><ErrorState onRetry={reload} /></div>
  if (loading || !data) return <div className="container-page space-y-4 py-10"><Skeleton className="h-40" /><Skeleton className="h-72" /></div>
  const stat = (label: string, value: React.ReactNode) => (
    <Card className="p-4"><p className="text-2xl font-extrabold tabular-nums">{value ?? '—'}</p><p className="text-xs text-muted-foreground">{label}</p></Card>
  )
  return (
    <>
      <PageHeader title={data.name} back={<BackButton fallback={`/tournaments/${data.tournament.id}?tab=speakers`} />}>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <Link to={`/tournaments/${data.tournament.id}`} className="flex items-center gap-1.5 hover:text-primary"><Trophy className="size-4 text-primary" />{data.tournament.name} · {formatDate(data.tournament.startDate)}</Link>
          <span className="flex items-center gap-1.5"><Users className="size-4 text-primary" />{data.team.name}</span>
          {data.team.institution && <span className="flex items-center gap-1.5"><Building2 className="size-4 text-primary" />{data.team.institution}</span>}
        </div>
      </PageHeader>
      <div className="container-page space-y-8 py-10">
        {data.userId
          ? <Link to={`/people/${data.userId}`} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">{t('speakerPage.career')}<ArrowRight className="size-4" /></Link>
          : <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">{t('speakerPage.noAccount')}</p>}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stat(t('speakerPage.rank'), data.rank ? `${data.rank} / ${data.speakers}` : null)}
          {stat(t('person.average'), data.average)}
          {stat(t('speakerPage.teamPlace'), data.team.place ? `${data.team.place} / ${data.team.teams}` : null)}
          {stat(t('speakerPage.debates'), `${data.rounds.filter(r => r.result === 'win' || r.result === 'place1').length} / ${data.rounds.length}`)}
        </div>
        {data.team.inBreak && <Badge variant="success"><Medal className="size-3.5" />{t('person.broke')}</Badge>}

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold"><Mic className="size-5 text-primary" />{t('speakerPage.rounds')}</h2>
          {data.rounds.length === 0 ? <EmptyState icon={<Mic className="size-7" />} title={t('speakerPage.noRounds')} /> : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{t('speakerPage.round')}</th><th className="px-4 py-3">{t('speakerPage.opponent')}</th>
                    <th className="px-4 py-3 text-center">{t('speakerPage.result')}</th><th className="px-4 py-3 text-center">{t('speakerPage.score')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rounds.map(r => (
                    <tr key={r.number}>
                      <td className="px-4 py-3"><p className="font-semibold">{r.round}</p><p className="line-clamp-1 text-xs text-muted-foreground">{quoted(r.motion)}</p></td>
                      <td className="px-4 py-3">{r.opponents}<p className="text-xs text-muted-foreground">{t(`tournament.${r.side}`)}</p></td>
                      <td className={cn('px-4 py-3 text-center font-semibold', r.result === 'win' || r.result === 'place1' ? 'text-success' : 'text-muted-foreground')}>
                        {r.result ? t(`profile.result.${r.result}`) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">{r.score ?? '—'}{r.reply ? <span className="text-xs text-muted-foreground"> · {t('speakerPage.reply', { score: r.reply })}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      </div>
    </>
  )
}
