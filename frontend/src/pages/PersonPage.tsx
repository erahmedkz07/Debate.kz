import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Award, CalendarDays, Gavel, MapPin, Medal, Mic, Trophy, Users } from 'lucide-react'
import { getPublicProfile, NotFoundError, type PublicProfile } from '@/api'
import { useAsync } from '@/lib/hooks'
import { formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/layout/Layout'
import { BackButton } from '@/components/layout/BackButton'
import { Avatar } from '@/components/auth/UserMenu'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import { Stars } from '@/components/tournament/JudgeFeedback'
import NotFound from './NotFound'

// A debater's public page: the career as a speaker and as a judge, and the awards. Hidden profiles return 404 to others.
export default function PersonPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => getPublicProfile(id), [id])
  if (error instanceof NotFoundError) return <NotFound />
  if (error) return <div className="container-page py-20"><ErrorState onRetry={reload} /></div>
  if (loading || !data) return <div className="container-page space-y-4 py-10"><Skeleton className="h-40" /><Skeleton className="h-72" /></div>
  const sp = data.speaker, jg = data.judge
  const stat = (label: string, value: React.ReactNode) => (
    <Card className="p-4"><p className="text-2xl font-extrabold tabular-nums">{value ?? '—'}</p><p className="text-xs text-muted-foreground">{label}</p></Card>
  )
  return (
    <>
      <PageHeader title={data.name} back={<BackButton fallback="/rating" />}
        media={<Avatar name={data.name} role="user" src={data.avatarUrl} className="size-20 text-2xl shadow-md sm:size-24" />}>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {data.club && <Link to={`/clubs/${data.club.id}`} className="flex items-center gap-1.5 hover:text-primary"><Users className="size-4 text-primary" />{data.club.name}</Link>}
          {data.city && <span className="flex items-center gap-1.5"><MapPin className="size-4 text-primary" />{data.city}</span>}
          <span className="flex items-center gap-1.5"><CalendarDays className="size-4 text-primary" />{t('person.since', { date: formatDate(data.since, { day: 'numeric', month: 'long', year: 'numeric' }) })}</span>
        </div>
      </PageHeader>
      <div className="container-page space-y-8 py-10">

        {data.awards.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-xl font-bold"><Award className="size-5 text-primary" />{t('person.awards')}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.awards.map(a => (
                <li key={a.code}>
                  <Link to={`/verify/${a.code}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
                    <Medal className="size-7 shrink-0 text-accent" />
                    <span className="min-w-0"><span className="block font-bold">{awardTitle(a, t)}</span><span className="block truncate text-xs text-muted-foreground">{a.tournament.name} · {formatDate(a.date)}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold"><Mic className="size-5 text-primary" />{t('person.asSpeaker')}</h2>
          {sp.tournaments.length === 0 ? <EmptyState icon={<Mic className="size-7" />} title={t('person.noSpeaker')} /> : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {stat(t('person.tournaments'), sp.tournaments.length)}
                {stat(t('person.debatesWins'), `${sp.wins} / ${sp.debates}`)}
                {stat(t('person.average'), sp.average)}
                {stat(t('person.best'), sp.best)}
              </div>
              <Card className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-muted/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr><th className="px-4 py-3">{t('person.tournament')}</th><th className="px-4 py-3">{t('common.team')}</th><th className="px-4 py-3 text-center">{t('person.place')}</th><th className="px-4 py-3 text-center">{t('person.speakerRank')}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sp.tournaments.map(x => (
                      <tr key={x.id}>
                        <td className="px-4 py-3"><Link to={`/tournaments/${x.id}`} className="font-semibold hover:text-primary">{x.name}</Link><p className="text-xs text-muted-foreground">{formatDate(x.startDate)}</p></td>
                        <td className="px-4 py-3">{x.team}{x.inBreak && <Badge variant="success" className="ml-2 px-1.5 py-0 text-[10px]"><Trophy className="size-3" />{t('person.broke')}</Badge>}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{x.place ? `${x.place} / ${x.teams}` : '—'}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{x.speakerRank ? `${x.speakerRank} · ${x.average}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold"><Gavel className="size-5 text-primary" />{t('person.asJudge')}</h2>
          {jg.tournaments.length === 0 ? <EmptyState icon={<Gavel className="size-7" />} title={t('person.noJudge')} /> : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {stat(t('person.tournaments'), jg.tournaments.length)}
                {stat(t('person.rounds'), jg.rounds)}
                {stat(t('person.chaired'), jg.chaired)}
                {stat(t('person.playoffRounds'), jg.playoffRounds)}
              </div>
              <p className="mt-3 flex items-center gap-2 text-sm">
                {jg.rating
                  ? <><Stars value={Math.round(jg.rating.average ?? 0)} size="size-4" /><b>{jg.rating.average}</b><span className="text-muted-foreground">· {t('feedback.count', { count: jg.rating.count })}</span></>
                  : <span className="text-muted-foreground">{t('person.ratingHidden')}</span>}
              </p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {jg.tournaments.map(x => (
                  <li key={x.id} className="rounded-xl bg-muted/50 px-4 py-3 text-sm">
                    <Link to={`/tournaments/${x.id}`} className="font-semibold hover:text-primary">{x.name}</Link>
                    <p className="text-xs text-muted-foreground">{formatDate(x.startDate)} · {t('person.roundsChaired', { rounds: x.rounds, chaired: x.chaired })}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </>
  )
}

function awardTitle(a: PublicProfile['awards'][number], t: (k: string, o?: Record<string, unknown>) => string) {
  if (a.kind === 'best_speaker' || a.kind === 'best_judge') return t(`certificate.awardTitle.${a.kind}`)
  if (a.kind === 'category_champion') return t('person.categoryChampion', { category: a.category })
  if (a.kind === 'team_place') return t('person.teamPlace', { n: a.place })
  return t('person.speakerPlace', { n: a.speakerPlace })
}
