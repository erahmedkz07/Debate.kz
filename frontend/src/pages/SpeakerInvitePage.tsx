import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Link2, Loader2, LogIn, Trophy, Users } from 'lucide-react'
import { acceptSpeakerInvite, getSpeakerInvite, NotFoundError } from '@/api'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorState, Skeleton } from '@/components/ui/states'
import { ResendVerification } from '@/components/auth/EmailBanner'
import NotFound from './NotFound'

// A teammate typed in by name opens the captain's link and links their account to that speaker slot,
// so the tournament joins their career.
export default function SpeakerInvitePage() {
  const { token = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, ready } = useAuth()
  const { data, loading, error, reload } = useAsync(() => getSpeakerInvite(token), [token])
  const [busy, setBusy] = useState(false)
  if (error instanceof NotFoundError) return <NotFound />
  if (error) return <div className="container-page py-20"><ErrorState onRetry={reload} /></div>
  if (loading || !data || !ready) return <div className="container-page max-w-xl py-16"><Skeleton className="h-80" /></div>

  const accept = async () => {
    setBusy(true)
    try {
      const r = await acceptSpeakerInvite(token)
      toast.success(t('speakerInvite.done'))
      navigate(`/people/${r.userId}`, { replace: true })
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }
  const back = encodeURIComponent(`/speaker-invite/${token}`)
  return (
    <section className="container-page max-w-xl py-12 sm:py-16">
      <Card className="p-6 sm:p-8">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary"><Link2 className="size-4" />{t('speakerInvite.badge')}</span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{t('speakerInvite.title', { name: data.speaker })}</h1>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><Trophy className="size-4 text-primary" />{data.tournament.name} · {formatDate(data.tournament.startDate)}</span>
          <span className="flex items-center gap-1.5"><Users className="size-4 text-primary" />{data.team}</span>
        </div>
        <p className="mt-5 leading-relaxed">{t('speakerInvite.text')}</p>
        <div className="mt-6">
          {data.state !== 'valid' ? (
            <p className="rounded-xl bg-danger-soft p-4 text-sm font-medium text-danger">{t(`apiErrors.invite_${data.state}`)}</p>
          ) : !user ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="flex-1"><Link to={`/login?next=${back}`}><LogIn className="size-4" />{t('nav.login')}</Link></Button>
              <Button asChild variant="outline" className="flex-1"><Link to={`/register?next=${back}`}>{t('auth.toRegister')}</Link></Button>
            </div>
          ) : !user.emailVerified ? (
            <div className="space-y-3"><p className="text-sm text-muted-foreground">{t('apiErrors.email_not_verified')}</p><ResendVerification /></div>
          ) : (
            <Button size="lg" className="w-full" onClick={accept} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />}{t('speakerInvite.accept', { name: data.speaker })}</Button>
          )}
        </div>
      </Card>
    </section>
  )
}
