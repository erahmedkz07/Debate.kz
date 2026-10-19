import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { toast } from 'sonner'
import { Award, CheckCircle2, DoorOpen, Gavel, Loader2, Trophy, UserCheck, Users } from 'lucide-react'
import { claimSpeaker, getSpeakerByLink } from '@/api'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { quoted } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'

// A speaker without an account, by their personal link (a QR card from the registration desk): their draw, results,
// scores, the judges' reasons and the certificate. "This is me" saves all of it to their own profile (Google in one
// step), and from then on their results count in the rating.
export default function SpeakerLink() {
  const { key = '' } = useParams()
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useAsync(() => getSpeakerByLink(key), [key])
  const [busy, setBusy] = useState(false)
  if (error) {
    const invalid = (error as { code?: string }).code === 'speaker_link_invalid'
    return <div className="container-page max-w-2xl py-16">{invalid
      ? <EmptyState icon={<Users className="size-7" />} title={t('speakerLink.invalid')} text={t('speakerLink.invalidText')} />
      : <ErrorState onRetry={reload} />}</div>
  }
  if (loading || !data) return <div className="container-page max-w-2xl space-y-3 py-10"><Skeleton className="h-24" /><Skeleton className="h-32" /></div>

  const claim = async () => {
    // not signed in: sign in (or sign up) first and come back here
    if (!user) return navigate(`/login?next=${encodeURIComponent(`/s/${key}`)}`)
    setBusy(true)
    try {
      await claimSpeaker(key)
      toast.success(t('speakerLink.claimed'))
      reload()
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container-page max-w-2xl py-8">
      <p className="text-sm font-semibold text-primary">{data.tournament.name} · {data.tournament.city}</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{data.speaker.name}</h1>
      <p className="mt-1 text-muted-foreground">{t('speakerLink.of', { team: data.team.name })}{data.team.league ? ` · ${data.team.league}` : ''}</p>

      {/* save to my profile */}
      {data.claimed ? (
        <p className="mt-5 flex items-start gap-2 rounded-2xl bg-success-soft p-4 text-sm text-success"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{t('speakerLink.inProfile')}</p>
      ) : (
        <Card className="mt-5 border-2 border-primary/30 p-5">
          <p className="font-bold">{t('speakerLink.claimTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('speakerLink.claimText')}</p>
          <Button className="mt-4" disabled={busy} onClick={claim}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}{t(user ? 'speakerLink.claim' : 'speakerLink.claimSignIn')}
          </Button>
        </Card>
      )}

      {data.certificate && (
        <Button asChild variant="accent" className="mt-4"><Link to={`/certificates/${data.certificate}`}><Award className="size-4" />{t('speakerLink.certificate')}</Link></Button>
      )}

      <h2 className="mt-8 text-lg font-bold">{t('speakerLink.debates')}</h2>
      <div className="mt-3 space-y-3">
        {data.debates.length === 0 && <EmptyState icon={<DoorOpen className="size-7" />} title={t('speakerLink.empty')} text={t('speakerLink.emptyText')} />}
        {data.debates.map(d => (
          <Card key={d.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="muted">{d.round.name}</Badge>
              <span className="flex items-center gap-1 text-muted-foreground"><DoorOpen className="size-4" />{d.room}</span>
              <span className="text-muted-foreground">· {t(`tournament.${d.side}`)}</span>
              {d.result && (
                <Badge variant={d.result.win || d.result.place === 1 ? 'success' : 'muted'} className="ml-auto">
                  {d.result.place ? t('ballot.placeN', { n: d.result.place }) : t(d.result.win ? 'profile.result.win' : 'profile.result.loss')}
                </Badge>
              )}
            </div>
            <p className="mt-2 font-bold">{t('speakerLink.vs', { teams: d.opponents.join(', ') })}</p>
            {d.round.motion && <p className="mt-1 text-sm text-muted-foreground">{quoted(d.round.motion)}</p>}
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><Gavel className="size-3.5" />
              {d.judges.map((j, i) => <span key={i} className={cn(j.isChair && 'font-semibold text-foreground')}>{j.name}{i < d.judges.length - 1 ? ',' : ''}</span>)}
            </p>
            {d.score !== undefined && <p className="mt-2 flex items-center gap-1.5 text-sm"><Trophy className="size-4 text-accent-foreground dark:text-accent" />{t('speakerLink.score', { score: d.score })}</p>}
            {d.reasons && d.reasons.length > 0 && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer font-semibold text-primary">{t('flow.reasons', { count: d.reasons.length })}</summary>
                <ul className="mt-2 space-y-2">{d.reasons.map((r, i) => <li key={i} className="rounded-xl bg-muted/50 p-3"><p className="text-xs font-bold text-muted-foreground">{r.judge}</p><p className="mt-0.5 whitespace-pre-line">{r.text}</p></li>)}</ul>
              </details>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
