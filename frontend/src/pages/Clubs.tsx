import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowRight, Building2, KeyRound, Loader2, LogIn, MapPin, Search, Users } from 'lucide-react'
import { getCities, getClubByCode, getClubs, getMe, joinClub, NotFoundError } from '@/api'
import type { ClubSummary } from '@/types'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { PageHeader } from '@/components/layout/Layout'
import { LoginRequiredDialog } from '@/components/auth/guards'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import NotFound from './NotFound'
import { BackButton } from '@/components/layout/BackButton'

function ClubCard({ c }: { c: ClubSummary }) {
  const { t } = useTranslation()
  return (
    <Link to={`/clubs/${c.id}`} className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
      <p className="font-bold leading-snug group-hover:text-primary">{c.name}</p>
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><MapPin className="size-3.5" />{c.city}</span>
        {c.institution && c.institution !== c.name && <span className="flex items-center gap-1"><Building2 className="size-3.5" />{c.institution}</span>}
      </p>
      <p className="mt-auto flex items-center justify-between pt-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5"><Users className="size-4 text-primary" />{t('club.membersCount', { count: c.members })} · {t('club.teamsCount', { count: c.teams })}</span>
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </p>
    </Link>
  )
}

// Directory of clubs: search, create your club, or join one with the code/link a member shared
export default function Clubs() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, signIn } = useAuth()
  const [params, setParams] = useSearchParams()
  const search = params.get('search') ?? '', city = params.get('city') ?? ''
  const { data, loading, error, reload } = useAsync(() => getClubs({ search: search || undefined, city: city || undefined }), [search, city])
  const { data: cities = [] } = useAsync(getCities)
  const [gate, setGate] = useState(false)
  const [joining, setJoining] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }) }
  const need = (fn: () => void) => () => {
    if (!user) return setGate(true)
    if (!user.emailVerified) return void toast.info(t('apiErrors.email_not_verified'))
    fn()
  }
  const go = async (fn: () => Promise<{ id: string }>) => {
    setBusy(true)
    try {
      const { id } = await fn()
      const me = await getMe()
      if (me) signIn(me)
      // the club is managed in the profile
      navigate(id ? '/me?tab=club' : '/clubs')
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title={t('club.title')} subtitle={t('club.subtitle')}>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {/* creating and managing a club happens in the profile ("My club"); here only finding and joining */}
          {user?.club ? (
            <Button asChild variant="outline"><Link to="/me?tab=club"><Users className="size-4" />{t('club.myClub', { name: user.club.name })}</Link></Button>
          ) : (
            <Button variant="outline" onClick={need(() => setJoining(true))}><KeyRound className="size-4" />{t('club.joinByCode')}</Button>
          )}
          <div className="relative min-w-56 flex-1 sm:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-10" defaultValue={search} onChange={e => set('search', e.target.value.trim())} placeholder={t('club.search')} aria-label={t('common.search')} />
          </div>
          <Select className="w-44" value={city || 'all'} onValueChange={v => set('city', v === 'all' ? '' : v)} aria-label={t('common.city')}
            options={[{ value: 'all', label: t('teammates.allCities') }, ...cities.map(c => ({ value: c, label: c }))]} />
        </div>
      </PageHeader>
      <div className="container-page py-10">
        {error ? <ErrorState onRetry={reload} /> : loading && !data ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-36" />)}</div>
        ) : !data?.length ? (
          <EmptyState icon={<Users className="size-7" />} title={t('club.empty')} text={t('club.emptyText')} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.map(c => <ClubCard key={c.id} c={c} />)}</div>
        )}
      </div>

      <LoginRequiredDialog open={gate} onOpenChange={setGate} text={t('club.loginText')} />
      <Dialog open={joining} onOpenChange={setJoining}>
        <DialogContent heading={t('club.joinByCode')} description={t('club.joinCodeText')}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void go(() => joinClub(code.trim())) }}>
            <Input autoFocus maxLength={8} value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABCD2345" className="text-center font-mono text-lg tracking-[0.3em]" aria-label={t('club.code')} />
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
              <Button type="submit" disabled={busy || code.trim().length !== 8}>{t('club.join')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

// /clubs/join/:code — the link a member shared
export function ClubJoin() {
  const { code = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, signIn } = useAuth()
  const { data, error, loading } = useAsync(() => getClubByCode(code), [code])
  const [busy, setBusy] = useState(false)
  if (error instanceof NotFoundError) return <NotFound />
  if (error) return <div className="container-page py-20"><ErrorState /></div>
  if (loading || !data) return <div className="container-page max-w-xl py-16"><Skeleton className="h-72" /></div>
  const inThis = user?.club?.id === data.id
  const join = async () => {
    setBusy(true)
    try {
      await joinClub(code)
      const me = await getMe()
      if (me) signIn(me)
      toast.success(t('club.joined', { name: data.name }))
      navigate('/me?tab=club')
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="container-page max-w-xl py-12 sm:py-16">
      <BackButton fallback="/clubs" className="-ml-1 mb-2" />
      <Card className="p-6 sm:p-8">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary"><Users className="size-4" />{t('club.invitation')}</span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">{data.name}</h1>
        <p className="mt-2 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><MapPin className="size-4 text-primary" />{data.city}</span>
          <span className="flex items-center gap-1.5"><Users className="size-4 text-primary" />{t('club.membersCount', { count: data.members })} · {t('club.teamsCount', { count: data.teams })}</span>
        </p>
        <div className="mt-6">
          {!user ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="flex-1"><Link to={`/login?next=${encodeURIComponent(`/clubs/join/${code}`)}`}><LogIn className="size-4" />{t('nav.login')}</Link></Button>
              <Button asChild variant="outline" className="flex-1"><Link to={`/register?next=${encodeURIComponent(`/clubs/join/${code}`)}`}>{t('auth.toRegister')}</Link></Button>
            </div>
          ) : inThis ? (
            <Button asChild className="w-full"><Link to={`/clubs/${data.id}`}>{t('club.alreadyHere')}</Link></Button>
          ) : user.club ? (
            <p className="rounded-xl bg-accent-soft p-4 text-sm">{t('club.leaveFirst', { name: user.club.name })} <Link to={`/clubs/${user.club.id}`} className="font-semibold text-primary hover:underline">{user.club.name}</Link></p>
          ) : (
            <Button size="lg" className="w-full" disabled={busy} onClick={join}>{busy && <Loader2 className="size-4 animate-spin" />}{t('club.join')}</Button>
          )}
        </div>
      </Card>
    </section>
  )
}
