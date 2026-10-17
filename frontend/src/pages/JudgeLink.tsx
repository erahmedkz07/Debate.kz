import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Award, CheckCircle2, ChevronRight, DoorOpen, Gavel, Star } from 'lucide-react'
import { getJudgeLink } from '@/api'
import { useAsync } from '@/lib/hooks'
import { quoted } from '@/lib/motion'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'

// A judge without an account, by their personal link: their tournament and every released debate they sit in, each
// opening its ballot. No sign-in; the link itself is the key (the organizer can replace it).
export default function JudgeLink() {
  const { key = '' } = useParams()
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => getJudgeLink(key), [key])
  if (error) {
    const invalid = (error as { code?: string }).code === 'judge_link_invalid'
    return <div className="container-page max-w-2xl py-16">{invalid
      ? <EmptyState icon={<Gavel className="size-7" />} title={t('judgeLink.invalid')} text={t('judgeLink.invalidText')} />
      : <ErrorState onRetry={reload} />}</div>
  }
  if (loading || !data) return <div className="container-page max-w-2xl space-y-3 py-10"><Skeleton className="h-24" /><Skeleton className="h-32" /></div>
  return (
    <div className="container-page max-w-2xl py-8">
      <p className="text-sm font-semibold text-primary">{data.tournament.name} · {data.tournament.city}</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{data.judge.name}</h1>
      <p className="mt-2 text-muted-foreground">{t('judgeLink.text')}</p>
      {data.certificates.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {data.certificates.map(c => (
            <Link key={c.code} to={`/certificates/${c.code}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-navy hover:opacity-90">
              <Award className="size-4" />{t(c.award ? 'judgeLink.awardCertificate' : 'judgeLink.certificate')}
            </Link>
          ))}
        </div>
      )}
      <div className="mt-6 space-y-3">
        {data.assignments.length === 0 && <EmptyState icon={<DoorOpen className="size-7" />} title={t('judgeLink.empty')} text={t('judgeLink.emptyText')} />}
        {data.assignments.map(a => (
          <Link key={a.debateId} to={`/j/${key}/ballot/${a.debateId}`} className="block">
            <Card className="flex items-center gap-4 p-4 transition-shadow hover:shadow-md">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="accent">{a.round.name}</Badge>
                  <span className="flex items-center gap-1 text-sm font-semibold"><DoorOpen className="size-4 text-primary" />{a.room}</span>
                  {a.isChair && <Badge variant="muted"><Star className="size-3" />{t('tournament.chair')}</Badge>}
                  {a.sent && <Badge variant="success"><CheckCircle2 className="size-3" />{t('judgeLink.sent')}</Badge>}
                </div>
                <p className="mt-2 font-bold">{a.teams.join(' · ')}</p>
                {a.round.motion && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{quoted(a.round.motion)}</p>}
              </div>
              <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">{t(a.sent ? 'judgeLink.open' : 'judgeLink.fill')}<ChevronRight className="size-4" /></span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
