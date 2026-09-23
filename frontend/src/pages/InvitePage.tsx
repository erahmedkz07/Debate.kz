import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CalendarDays, Gavel, Loader2, LogIn, MapPin, ShieldCheck, Users } from 'lucide-react'
import { acceptInvite, getInvite, NotFoundError } from '@/api'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { formatDateRange } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorState, Skeleton } from '@/components/ui/states'
import { ResendVerification } from '@/components/auth/EmailBanner'
import NotFound from './NotFound'

// Landing page of a judge / co-organizer invite link sent by a tournament organizer
export default function InvitePage() {
  const { token = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, ready, signIn } = useAuth()
  const { data, loading, error, reload } = useAsync(() => getInvite(token), [token])
  const [busy, setBusy] = useState(false)

  if (error instanceof NotFoundError) return <NotFound />
  if (error) return <div className="container-page py-20"><ErrorState onRetry={reload} /></div>
  if (loading || !data || !ready) return <div className="container-page max-w-xl py-16"><Skeleton className="h-96" /></div>

  const Icon = data.kind === 'judge' ? Gavel : Users
  const accept = async () => {
    setBusy(true)
    try {
      const r = await acceptInvite(token)
      // refresh the "judges / organizes" flags in the header menu
      signIn({ ...user!, judges: user!.judges || r.kind === 'judge', organizes: user!.organizes || r.kind === 'co_organizer' })
      toast.success(t(`invite.accepted.${r.kind}`))
      navigate(r.kind === 'judge' ? '/judge' : `/dashboard/tournaments/${r.tournamentId}`, { replace: true })
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="container-page max-w-xl py-12 sm:py-16">
      <Card className="overflow-hidden">
        {data.tournament.cover && <img src={data.tournament.cover} alt="" className="h-40 w-full object-cover" />}
        <div className="p-6 sm:p-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
            <Icon className="size-4" />{t(`invite.kind.${data.kind}`)}
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">{data.tournament.name}</h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><CalendarDays className="size-4 text-primary" />{formatDateRange(data.tournament.startDate, data.tournament.endDate)}</span>
            <span className="flex items-center gap-1.5"><MapPin className="size-4 text-primary" />{data.tournament.city}</span>
          </div>
          <p className="mt-5 leading-relaxed">{t(`invite.text.${data.kind}`, { name: data.invitedBy })}</p>
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />{t('invite.scope')}
          </p>

          <div className="mt-6">
            {data.state !== 'valid' ? (
              <p className="rounded-xl bg-danger-soft p-4 text-sm font-medium text-danger">{t(`apiErrors.invite_${data.state}`)}</p>
            ) : !user ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild className="flex-1"><Link to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}><LogIn className="size-4" />{t('nav.login')}</Link></Button>
                <Button asChild variant="outline" className="flex-1"><Link to={`/register?next=${encodeURIComponent(`/invite/${token}`)}`}>{t('auth.toRegister')}</Link></Button>
              </div>
            ) : !user.emailVerified ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t('apiErrors.email_not_verified')}</p>
                <ResendVerification />
              </div>
            ) : (
              <Button size="lg" className="w-full" onClick={accept} disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}{t('invite.accept')}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </section>
  )
}
