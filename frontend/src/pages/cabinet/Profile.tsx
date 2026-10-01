import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AlertCircle, Award, Shield, BadgeCheck, Bell, BellOff, Building2, CalendarDays, CheckCircle2, ChevronRight, DoorOpen, ExternalLink, KeyRound, Mail, MapPin, Phone, RefreshCw, Send, Settings, ShieldCheck, Swords, Trash2, Star, TrendingUp, Trophy, Unlink, UserRound, Users } from 'lucide-react'
import { type MyDebate, changePassword, createTelegramLink, deleteAccount, getGoogleConfig, getMe, requestPasswordSetup, unlinkGoogle, getMyDebates, getMyRegistrations, getTelegramConfig, setTelegramNotify, unlinkTelegram, updateProfile } from '@/api'
import { errorMessage } from '@/lib/errors'
import type { TeamRegistration } from '@/types'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { cn, formatDate, formatDateRange } from '@/lib/utils'
import { AvatarEditor } from '@/components/auth/AvatarEditor'
import { GoogleButton, GoogleIcon } from '@/components/auth/GoogleButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Input, Label, Switch } from '@/components/ui/input'
import { SideTabsList, SideTabsTrigger, Tabs, TabsContent } from '@/components/ui/tabs'
import { EmptyState, Skeleton } from '@/components/ui/states'
import { OrnamentPattern } from '@/components/brand'
import { ProgressPanel } from '@/components/profile/ProgressPanel'
import { CertificatesPanel } from '@/components/profile/CertificatesPanel'
import { MyClub } from '@/components/club/MyClub'
import { OnlineLink } from '@/components/tournament/OnlineLink'
import { RateJudgesDialog } from '@/components/tournament/JudgeFeedback'

const regVariant: Record<TeamRegistration['status'], 'success' | 'accent' | 'danger' | 'outline'> = { confirmed: 'success', pending: 'accent', rejected: 'danger', waitlisted: 'outline' }

// Telegram: notifications, phone verification and one-tap judge feedback
function TelegramCard() {
  const { t, i18n } = useTranslation()
  const { user, signIn } = useAuth()
  const config = useAsync(getTelegramConfig)
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!config.data?.enabled || !user) return null
  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast.error(errorMessage(e, t)) } finally { setBusy(false) }
  }
  const connect = () => act(async () => {
    const { url } = await createTelegramLink(i18n.language === 'kz' ? 'kz' : 'ru')
    setLink(url)
    window.open(url, '_blank', 'noopener')
  })
  // after pressing Start in Telegram the user comes back and refreshes the status
  const refresh = () => act(async () => {
    const me = await getMe()
    if (me) signIn(me)
    if (me?.telegramLinked) { setLink(null); toast.success(t('telegram.connected')) } else toast(t('telegram.notYet'))
  })
  return (
    <Card className="flex h-full flex-col p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-bold"><Send className="size-4 text-primary" />Telegram</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('telegram.text')}</p>
        </div>
        {user.telegramLinked && <Badge variant="success"><CheckCircle2 className="size-3" />{t('telegram.linked')}{user.telegramUsername && ` · @${user.telegramUsername}`}</Badge>}
      </div>
      <ul className="mb-5 mt-4 space-y-1.5 text-sm">
        <li className="flex items-center gap-2"><Bell className="size-4 text-primary" />{t('telegram.f1')}</li>
        <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" />{t('telegram.f2')}</li>
        <li className="flex items-center gap-2"><BadgeCheck className="size-4 text-primary" />{t('telegram.f3')}</li>
        <li className="flex items-center gap-2"><Send className="size-4 text-primary" />{t('telegram.f4')}</li>
      </ul>
      {user.telegramLinked ? (
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <p className="mr-auto text-sm">{user.phoneVerified ? <span className="flex items-center gap-1.5 text-success"><BadgeCheck className="size-4" />{t('telegram.phoneOk')}</span> : t('telegram.phoneHint')}</p>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(async () => { signIn(await setTelegramNotify(!user.telegramNotify)) })}>
            {user.telegramNotify ? <><BellOff className="size-4" />{t('telegram.mute')}</> : <><Bell className="size-4" />{t('telegram.unmute')}</>}
          </Button>
          <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => act(async () => { signIn(await unlinkTelegram()); toast(t('telegram.unlinked')) })}>
            <Unlink className="size-4" />{t('telegram.unlink')}
          </Button>
        </div>
      ) : (
        <div className="mt-auto border-t border-border pt-4">
          {link ? (
            <div className="space-y-3">
              <p className="text-sm">{t('telegram.step')}</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline"><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" />{t('telegram.openAgain')}</a></Button>
                <Button disabled={busy} onClick={refresh}><RefreshCw className="size-4" />{t('telegram.done')}</Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('telegram.linkTtl')}</p>
            </div>
          ) : <Button disabled={busy} onClick={connect}><Send className="size-4" />{t('telegram.connect', { bot: config.data.username })}</Button>}
        </div>
      )}
    </Card>
  )
}

function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const empty = { current: '', next: '', repeat: '' }
  const [f, setF] = useState(empty)
  const [busy, setBusy] = useState(false)
  const mismatch = !!f.repeat && f.next !== f.repeat
  const valid = !!f.current && f.next.length >= 8 && f.next === f.repeat
  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) setF(empty) }}>
      <DialogContent heading={t('profile.password.title')} description={t('profile.password.text')}>
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={async e => {
        e.preventDefault()
        if (!valid) return
        setBusy(true)
        try {
          signIn(await changePassword(f.current, f.next))
          setF(empty)
          onOpenChange(false)
          toast.success(t('profile.password.changed'))
        } catch (err) {
          toast.error(errorMessage(err, t))
        } finally {
          setBusy(false)
        }
      }}>
        <div className="sm:col-span-2">
          <Label htmlFor="pw-cur">{t('profile.password.current')}</Label>
          <Input id="pw-cur" type="password" autoComplete="current-password" value={f.current} onChange={e => setF({ ...f, current: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="pw-new">{t('profile.password.new')}</Label>
          <Input id="pw-new" type="password" autoComplete="new-password" value={f.next} onChange={e => setF({ ...f, next: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="pw-rep">{t('profile.password.repeat')}</Label>
          <Input id="pw-rep" type="password" autoComplete="new-password" aria-invalid={mismatch} value={f.repeat} onChange={e => setF({ ...f, repeat: e.target.value })} />
          {mismatch && <p className="mt-1 text-xs text-danger">{t('profile.password.mismatch')}</p>}
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">{t('profile.password.hint')}</p>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
          <Button type="submit" disabled={!valid || busy}>{t('profile.password.submit')}</Button>
        </div>
      </form>
      </DialogContent>
    </Dialog>
  )
}

// personal data law: a user can delete their account; confirmed with the password
function DeleteAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  // an account created with Google has no password: typing the email confirms instead
  const byEmail = !user?.hasPassword
  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) setPassword('') }}>
      <DialogContent heading={t('profile.deleteAccount.confirmTitle')} description={t('profile.deleteAccount.confirmText')}>
        <p className="mb-4 text-sm text-muted-foreground">{t('profile.deleteAccount.text')}</p>
        <form className="space-y-4" onSubmit={async e => {
          e.preventDefault()
          if (!password) return
          setBusy(true)
          try {
            await deleteAccount(byEmail ? { email: password.trim() } : { password })
            navigate('/', { replace: true })
            await signOut()
            toast(t('profile.deleteAccount.deleted'))
          } catch (err) {
            toast.error(errorMessage(err, t))
            setBusy(false)
          }
        }}>
          <div>
            <Label htmlFor="del-pw">{byEmail ? t('google.deleteByEmail', { email: user?.email }) : t('profile.deleteAccount.password')}</Label>
            <Input id="del-pw" type={byEmail ? 'email' : 'password'} autoComplete={byEmail ? 'off' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button type="submit" variant="danger" disabled={!password || busy}><Trash2 className="size-4" />{t('profile.deleteAccount.button')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// password and account removal live here as compact rows; the forms open in dialogs
// the public career page and the switch that hides it (the personal-data law; many debaters are schoolchildren)
function PublicProfileCard() {
  const { t } = useTranslation()
  const { user, signIn } = useAuth()
  const [busy, setBusy] = useState(false)
  if (!user) return null
  const toggle = async (hidden: boolean) => {
    setBusy(true)
    try {
      // the session keeps the club and the roles; only the flag changes
      const updated = await updateProfile({ name: user.name, phone: user.phone, institution: user.institution, city: user.city, profileHidden: hidden })
      signIn({ ...user, profileHidden: updated.profileHidden })
      toast.success(t(hidden ? 'person.hiddenToast' : 'person.shownToast'))
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 font-bold"><UserRound className="size-4 text-primary" />{t('person.cardTitle')}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t('person.cardText')}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/people/${user.id}`} className="text-sm font-semibold text-primary hover:underline">{t('person.open')}</Link>
        <span className={cn('flex items-center gap-2 text-sm font-medium', busy && 'pointer-events-none opacity-60')}>
          <Switch checked={!!user.profileHidden} onChange={v => void toggle(v)} label={t('person.hide')} />{t('person.hide')}
        </span>
      </div>
    </Card>
  )
}

function SecurityCard({ canDelete }: { canDelete: boolean }) {
  const { t } = useTranslation()
  const { user, signIn } = useAuth()
  const google = useAsync(getGoogleConfig)
  const [pwOpen, setPwOpen] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [setupSent, setSetupSent] = useState(false)
  if (!user) return null
  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast.error(errorMessage(e, t)) } finally { setBusy(false) }
  }
  return (
    <Card className="h-full p-6 lg:only:col-span-2">
      <h3 className="flex items-center gap-2 font-bold"><ShieldCheck className="size-4 text-primary" />{t('profile.security.title')}</h3>
      {/* Google: shown when the server supports it, or when an account is already linked */}
      {(google.data?.enabled || user.googleLinked) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
          <div className="flex min-w-0 items-center gap-3">
            <GoogleIcon />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Google</p>
              <p className="truncate text-xs text-muted-foreground">{user.googleLinked ? user.googleEmail : t('google.notLinked')}</p>
            </div>
          </div>
          {user.googleLinked ? (
            <Button size="sm" variant="ghost" className="text-danger" disabled={busy}
              title={user.hasPassword ? undefined : t('apiErrors.set_password_first')}
              onClick={() => act(async () => {
                if (!user.hasPassword) return void toast.info(t('apiErrors.set_password_first'))
                signIn(await unlinkGoogle())
                toast(t('google.unlinked'))
              })}>
              <Unlink className="size-4" />{t('google.unlink')}
            </Button>
          ) : <GoogleButton mode="link" label={t('google.link')} className="h-9 w-auto rounded-lg px-3" />}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t('profile.security.password')}</p>
          {user.hasPassword
            ? <p className="text-xs tracking-widest text-muted-foreground">••••••••</p>
            : <p className="text-xs text-muted-foreground">{setupSent ? t('google.setupSent', { email: user.email }) : t('google.noPassword')}</p>}
        </div>
        {user.hasPassword
          ? <Button size="sm" variant="outline" onClick={() => setPwOpen(true)}><KeyRound className="size-4" />{t('profile.security.change')}</Button>
          : <Button size="sm" variant="outline" disabled={busy || setupSent} onClick={() => act(async () => { await requestPasswordSetup(); setSetupSent(true); toast.success(t('google.setupSent', { email: user.email })) })}>
              <Mail className="size-4" />{t('google.setPassword')}
            </Button>}
      </div>
      {canDelete && (
        <div className="mt-3 flex items-center justify-between gap-3 px-1">
          <p className="text-xs text-muted-foreground">{t('profile.security.deleteHint')}</p>
          <Button size="sm" variant="ghost" className="shrink-0 text-danger" onClick={() => setDelOpen(true)}><Trash2 className="size-4" />{t('profile.security.delete')}</Button>
        </div>
      )}
      <PasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
      {canDelete && <DeleteAccountDialog open={delOpen} onOpenChange={setDelOpen} />}
    </Card>
  )
}

// small counter inside a section tab
const Count = ({ n }: { n?: number }) => (n ? <span className="ml-auto pl-2 text-xs tabular-nums opacity-70">{n}</span> : null)

export default function Profile() {
  const { t } = useTranslation()
  const { user, signIn } = useAuth()
  const isAdmin = user?.role === 'admin'
  // admins don't compete, so their participant data is not loaded at all
  const regs = useAsync(() => (isAdmin ? Promise.resolve([]) : getMyRegistrations()), [user?.id])
  const debates = useAsync(() => (isAdmin ? Promise.resolve([]) : getMyDebates()), [user?.id])
  // rating the judges of one of my debates
  const [rating, setRating] = useState<MyDebate | null>(null)
  const [form, setForm] = useState({ name: user!.name, phone: user!.phone ?? '', institution: user!.institution ?? '', city: user!.city ?? '' })
  const [params, setParams] = useSearchParams()
  // ?tab=club etc. opens a section; a participant without a club lands on "My club" (the club is required to apply)
  const asked = params.get('tab') ?? (params.has('club') ? 'club' : null)
  const [tab, setTab] = useState(isAdmin || params.has('welcome') || params.has('google') || params.has('google_error') ? 'settings'
    : asked && ['club', 'registrations', 'debates', 'progress', 'certificates', 'settings'].includes(asked) ? asked : !user?.clubTeam ? 'club' : 'registrations')
  // the server sends people back here after Google: ?welcome=1 (new account), ?google=linked, ?google_error=…
  useEffect(() => {
    const welcome = params.get('welcome'), linked = params.get('google'), failed = params.get('google_error')
    if (!welcome && !linked && !failed) { if (params.has('club') || params.has('tab')) setParams({}, { replace: true }); return }
    if (welcome) toast.success(t('google.welcome', { name: user?.name.split(' ')[0] }), { description: t('google.welcomeText'), duration: 8000 })
    if (linked) { toast.success(t('google.linked')); void getMe().then(me => me && signIn(me)) }
    if (failed) toast.error(t(`google.errors.${failed}`, { defaultValue: t('google.errors.google_failed') }))
    setParams({}, { replace: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!user) return null
  // what a participant still has to add (a Google sign-up brings only the name, email and photo)
  const missing = isAdmin ? [] : ([['club', user.clubTeam], ['phone', user.phone], ['institution', user.institution], ['city', user.city]] as const).filter(([, v]) => !v).map(([k]) => k)

  const played = debates.data?.filter(d => d.result) ?? []
  const wins = played.filter(d => d.result === 'win').length
  const upcoming = debates.data?.filter(d => !d.result) ?? []

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6">
      {/* profile card */}
      <Card className="relative overflow-hidden">
        {/* cover: taller, soft fade at the bottom so the card body doesn't feel glued to it */}
        <div className="relative h-36 bg-gradient-to-r from-primary via-[#0088b5] to-navy sm:h-44">
          <OrnamentPattern className="text-white/[0.07]" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-navy/25 to-transparent" />
        </div>
        <div className="flex flex-col items-center gap-5 px-6 pb-7 text-center sm:flex-row sm:items-start sm:gap-6 sm:px-8 sm:text-left">
          {/* the avatar overlaps the cover by half; the text starts below the cover with its own spacing */}
          <AvatarEditor className="-mt-14 sm:-mt-16" />
          <div className="min-w-0 flex-1 sm:pt-5">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{user.name}</h1>
              {user.role === 'admin' && <Badge variant="danger">{t('roles.admin')}</Badge>}
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground sm:justify-start">
              <span className="flex items-center gap-1.5"><Mail className="size-4 text-primary" />{user.email}
                {user.emailVerified && <BadgeCheck className="size-4 text-success" aria-label={t('google.emailVerified')} />}
              </span>
              {user.googleLinked && <span className="flex items-center gap-1.5" title={user.googleEmail}><GoogleIcon className="size-4" />{t('google.linkedShort')}</span>}
              {user.phone && (
                <span className="flex items-center gap-1.5"><Phone className="size-4 text-primary" />{user.phone}
                  {user.phoneVerified && <BadgeCheck className="size-4 text-success" aria-label={t('telegram.phoneOk')} />}
                </span>
              )}
              {user.club && <Link to={`/clubs/${user.club.id}`} className="flex items-center gap-1.5 hover:text-primary"><Users className="size-4 text-primary" />{user.club.name}{user.clubTeam && ` · ${user.clubTeam.name}`}</Link>}
              {user.institution && <span className="flex items-center gap-1.5"><Building2 className="size-4 text-primary" />{user.institution}</span>}
              {user.city && <span className="flex items-center gap-1.5"><MapPin className="size-4 text-primary" />{user.city}</span>}
            </div>
          </div>
        </div>
      </Card>

      {/* stats: participant sections are hidden for admins (they don't compete) */}
      {!isAdmin && <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: t('profile.stats.registrations'), value: regs.data?.length, icon: Users },
          { label: t('profile.stats.debates'), value: played.length, icon: Swords },
          { label: t('profile.stats.wins'), value: wins, icon: Trophy },
          { label: t('profile.stats.upcoming'), value: upcoming.length, icon: CalendarDays },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-5">
            <Icon className="size-5 text-primary" />
            <p className="mt-3 text-3xl font-extrabold tabular-nums">{value ?? '—'}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </Card>
        ))}
      </div>}

      {missing.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-accent bg-accent-soft p-4 text-sm">
          <AlertCircle className="size-5 shrink-0 text-navy dark:text-accent" />
          <p className="min-w-0 flex-1"><b>{t('google.completeTitle')}</b> {t('google.completeText', { fields: missing.map(k => t(`google.fields.${k}`)).join(', ') })}</p>
          <Button size="sm" onClick={() => { setTab('settings'); if (missing[0] === 'club') return setTab('club'); setTimeout(() => document.getElementById(missing[0] === 'phone' ? 'p-phone' : missing[0] === 'city' ? 'p-city' : 'p-inst')?.focus(), 50) }}>{t('google.completeButton')}</Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        {/* laptops: sections in a sticky sidebar, content on the right; phones: tabs on top */}
        <div className={cn('grid grid-cols-1 gap-6', !isAdmin && 'lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start')}>
        {!isAdmin && (
          <SideTabsList aria-label={t('profile.tabs.label')}>
            <SideTabsTrigger value="club"><Shield className="size-4" />{t('profile.tabs.club')}{!user.clubTeam && <span className="ml-auto size-2 rounded-full bg-danger" aria-label={t('club.required')} />}</SideTabsTrigger>
            <SideTabsTrigger value="registrations"><Users className="size-4" />{t('profile.tabs.registrations')}<Count n={regs.data?.length} /></SideTabsTrigger>
            <SideTabsTrigger value="debates"><Swords className="size-4" />{t('profile.tabs.debates')}<Count n={debates.data?.length} /></SideTabsTrigger>
            <SideTabsTrigger value="progress"><TrendingUp className="size-4" />{t('profile.tabs.progress')}</SideTabsTrigger>
            <SideTabsTrigger value="certificates"><Award className="size-4" />{t('profile.tabs.certificates')}</SideTabsTrigger>
            <SideTabsTrigger value="settings"><Settings className="size-4" />{t('profile.tabs.settings')}</SideTabsTrigger>
          </SideTabsList>
        )}
        <div className="min-w-0">

        <TabsContent value="registrations" className="mt-0">
          {regs.loading || !regs.data ? <Skeleton className="h-40" /> : regs.data.length === 0 ? (
            <EmptyState icon={<Users className="size-7" />} title={t('profile.noRegs')} text={t('profile.noRegsText')}
              action={<Button asChild><Link to="/tournaments">{t('home.audience.partCta')}</Link></Button>} />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {regs.data.map(r => (
                <Link key={r.id} to={`/tournaments/${r.tournamentId}`}
                  className="group flex gap-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                  <img src={r.tournament.cover} alt="" className="w-28 shrink-0 object-cover sm:w-36" />
                  <div className="min-w-0 flex-1 py-4 pr-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold leading-snug group-hover:text-primary">{r.tournament.name}</p>
                      <Badge variant={regVariant[r.status]}>{t(`profile.regStatus.${r.status}`)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateRange(r.tournament.startDate, r.tournament.endDate)} · {r.tournament.city}</p>
                    <p className="mt-3 text-sm"><b>{r.teamName}</b> <span className="text-muted-foreground">· {r.institution}</span></p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{r.speakers.join(', ')}</p>
                  </div>
                  <ChevronRight className="mr-3 size-5 shrink-0 self-center text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="debates" className="mt-0">
          {debates.loading || !debates.data ? <Skeleton className="h-40" /> : debates.data.length === 0 ? (
            <EmptyState icon={<Swords className="size-7" />} title={t('profile.noDebates')} />
          ) : (
            <div className="space-y-3">
              {debates.data.map(d => (
                <div key={d.debate.id}>
                <Link to={`/tournaments/${d.tournament.id}?tab=draw`}
                  className="group flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                  <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl text-sm font-extrabold',
                    d.place && d.place > 1 ? 'bg-muted' : d.result === 'win' ? 'bg-success-soft text-success' : d.result === 'loss' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-navy dark:text-accent')}>
                    {d.round.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{t(`tournament.${d.side}`)} <span className="font-normal text-muted-foreground">vs</span> {d.opponent.name}</p>
                    <p className="line-clamp-1 text-sm text-muted-foreground">«{d.round.motion}»</p>
                    <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{d.tournament.name}</span>
                      <span className="flex items-center gap-1"><DoorOpen className="size-3.5" />{d.debate.room}</span>
                      <span>{formatDate(d.round.date)}</span>
                    </p>
                  </div>
                  {/* BP: the place 1–4 instead of a win or a loss */}
                  <Badge variant={d.place ? (d.place === 1 ? 'success' : 'muted') : d.result === 'win' ? 'success' : d.result === 'loss' ? 'danger' : 'accent'}>
                    {d.place ? t('ballot.placeN', { n: d.place }) : d.result ? t(`profile.result.${d.result}`) : d.silent ? t('profile.result.silent') : t('profile.result.upcoming')}
                  </Badge>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
                <div className="ml-4 mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                  {d.debate.onlineUrl && d.round.status !== 'completed' && <OnlineLink url={d.debate.onlineUrl} />}
                  {d.judges.length > 0 && (
                    <button type="button" onClick={() => setRating(d)} className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-primary hover:underline">
                      <Star className={cn('size-4', d.judges.some(j => j.myScore) && 'fill-accent text-accent')} />
                      {d.judges.every(j => j.myScore) ? t('feedback.rated') : t('feedback.rate')}
                    </button>
                  )}
                </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {rating && <RateJudgesDialog debate={rating} open onOpenChange={o => !o && setRating(null)} onSaved={debates.reload} />}
        <TabsContent value="progress" className="mt-0"><ProgressPanel /></TabsContent>
        <TabsContent value="certificates" className="mt-0"><CertificatesPanel /></TabsContent>
        <TabsContent value="club" className="mt-0"><MyClub /></TabsContent>

        <TabsContent value="settings" className="mt-0">
          {/* personal data across the full width; below it Telegram and security side by side, equal height */}
          <div className="space-y-5">
          <Card className="p-6">
            <h3 className="mb-4 flex items-center gap-2 font-bold"><UserRound className="size-4 text-primary" />{t('profile.personal')}</h3>
            <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={async e => {
              e.preventDefault()
              try {
                signIn(await updateProfile(form))
                toast.success(t('dashboard.teams.saved'))
              } catch (err) {
                toast.error(errorMessage(err, t))
              }
            }}>
              <div><Label htmlFor="p-name">{t('auth.name')}</Label><Input id="p-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label htmlFor="p-phone">{t('auth.phone')}</Label>
                <Input id="p-phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                {user.phoneVerified && <p className="mt-1 flex items-center gap-1 text-xs text-success"><BadgeCheck className="size-3.5" />{t('profile.phoneVerifiedHint')}</p>}
              </div>
              <div className={cn(isAdmin && 'sm:col-span-2')}><Label htmlFor="p-city">{t('common.city')}</Label><Input id="p-city" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
              {!isAdmin && <div><Label htmlFor="p-inst">{t('common.institution')}</Label><Input id="p-inst" value={form.institution} onChange={e => setForm({ ...form, institution: e.target.value })} /></div>}
              <div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={!form.name.trim()}>{t('common.save')}</Button></div>
            </form>
          </Card>
          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
            <TelegramCard />
            {/* admins are demoted by another admin before they can leave */}
            {!isAdmin && <PublicProfileCard />}
            <SecurityCard canDelete={!isAdmin} />
          </div>
          </div>
        </TabsContent>
        </div>
        </div>
      </Tabs>
    </div>
  )
}
