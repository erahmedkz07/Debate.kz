import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Building2, CalendarDays, ChevronRight, DoorOpen, KeyRound, Mail, MapPin, Phone, Swords, Trash2, Trophy, Users } from 'lucide-react'
import { changePassword, deleteAccount, getMyDebates, getMyRegistrations, updateProfile } from '@/api'
import { errorMessage } from '@/lib/errors'
import type { TeamRegistration } from '@/types'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { cn, formatDate, formatDateRange } from '@/lib/utils'
import { AvatarEditor } from '@/components/auth/AvatarEditor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, Skeleton } from '@/components/ui/states'
import { OrnamentPattern } from '@/components/brand'

const regVariant: Record<TeamRegistration['status'], 'success' | 'accent' | 'danger'> = { confirmed: 'success', pending: 'accent', rejected: 'danger' }

function PasswordCard() {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const empty = { current: '', next: '', repeat: '' }
  const [f, setF] = useState(empty)
  const [busy, setBusy] = useState(false)
  const mismatch = !!f.repeat && f.next !== f.repeat
  const valid = !!f.current && f.next.length >= 8 && f.next === f.repeat
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 font-bold"><KeyRound className="size-4 text-primary" />{t('profile.password.title')}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t('profile.password.text')}</p>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={async e => {
        e.preventDefault()
        if (!valid) return
        setBusy(true)
        try {
          signIn(await changePassword(f.current, f.next))
          setF(empty)
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
        <div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={!valid || busy}>{t('profile.password.submit')}</Button></div>
      </form>
    </Card>
  )
}

// personal data law: a user can delete their account; confirmed with the password
function DeleteAccountCard() {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Card className="border-danger/40 p-6">
      <h3 className="font-bold text-danger">{t('profile.deleteAccount.title')}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t('profile.deleteAccount.text')}</p>
      <Button variant="danger" className="mt-4" onClick={() => { setPassword(''); setOpen(true) }}><Trash2 className="size-4" />{t('profile.deleteAccount.button')}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent heading={t('profile.deleteAccount.confirmTitle')} description={t('profile.deleteAccount.confirmText')}>
          <form className="space-y-4" onSubmit={async e => {
            e.preventDefault()
            if (!password) return
            setBusy(true)
            try {
              await deleteAccount(password)
              await signOut()
              toast(t('profile.deleteAccount.deleted'))
              navigate('/', { replace: true })
            } catch (err) {
              toast.error(errorMessage(err, t))
              setBusy(false)
            }
          }}>
            <div>
              <Label htmlFor="del-pw">{t('profile.deleteAccount.password')}</Label>
              <Input id="del-pw" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
              <Button type="submit" variant="danger" disabled={!password || busy}><Trash2 className="size-4" />{t('profile.deleteAccount.button')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export default function Profile() {
  const { t } = useTranslation()
  const { user, signIn } = useAuth()
  const isAdmin = user?.role === 'admin'
  // admins don't compete, so their participant data is not loaded at all
  const regs = useAsync(() => (isAdmin ? Promise.resolve([]) : getMyRegistrations()), [user?.id])
  const debates = useAsync(() => (isAdmin ? Promise.resolve([]) : getMyDebates()), [user?.id])
  const [form, setForm] = useState({ name: user!.name, phone: user!.phone ?? '', institution: user!.institution ?? '', city: user!.city ?? '' })
  if (!user) return null

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
              <span className="flex items-center gap-1.5"><Mail className="size-4 text-primary" />{user.email}</span>
              {user.phone && <span className="flex items-center gap-1.5"><Phone className="size-4 text-primary" />{user.phone}</span>}
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

      <Tabs defaultValue={isAdmin ? 'settings' : 'registrations'} className="mt-8">
        <TabsList className="w-fit">
          {!isAdmin && <TabsTrigger value="registrations">{t('profile.tabs.registrations')}</TabsTrigger>}
          {!isAdmin && <TabsTrigger value="debates">{t('profile.tabs.debates')}</TabsTrigger>}
          <TabsTrigger value="settings">{t('profile.tabs.settings')}</TabsTrigger>
        </TabsList>

        <TabsContent value="registrations">
          {regs.loading || !regs.data ? <Skeleton className="h-40" /> : regs.data.length === 0 ? (
            <EmptyState icon={<Users className="size-7" />} title={t('profile.noRegs')} text={t('profile.noRegsText')}
              action={<Button asChild><Link to="/tournaments">{t('home.audience.partCta')}</Link></Button>} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
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

        <TabsContent value="debates">
          {debates.loading || !debates.data ? <Skeleton className="h-40" /> : debates.data.length === 0 ? (
            <EmptyState icon={<Swords className="size-7" />} title={t('profile.noDebates')} />
          ) : (
            <div className="space-y-3">
              {debates.data.map(d => (
                <Link key={d.debate.id} to={`/tournaments/${d.tournament.id}?tab=draw`}
                  className="group flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                  <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl text-sm font-extrabold',
                    d.result === 'win' ? 'bg-success-soft text-success' : d.result === 'loss' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-navy dark:text-accent')}>
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
                  <Badge variant={d.result === 'win' ? 'success' : d.result === 'loss' ? 'danger' : 'accent'}>
                    {d.result ? t(`profile.result.${d.result}`) : t('profile.result.upcoming')}
                  </Badge>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="max-w-2xl space-y-5">
          <Card className="p-6">
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={async e => {
              e.preventDefault()
              try {
                signIn(await updateProfile(form))
                toast.success(t('dashboard.teams.saved'))
              } catch (err) {
                toast.error(errorMessage(err, t))
              }
            }}>
              <div className="sm:col-span-2"><Label htmlFor="p-name">{t('auth.name')}</Label><Input id="p-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label htmlFor="p-phone">{t('auth.phone')}</Label><Input id="p-phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label htmlFor="p-city">{t('common.city')}</Label><Input id="p-city" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label htmlFor="p-inst">{t('common.institution')}</Label><Input id="p-inst" value={form.institution} onChange={e => setForm({ ...form, institution: e.target.value })} /></div>
              <div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={!form.name.trim()}>{t('common.save')}</Button></div>
            </form>
          </Card>
          <PasswordCard />
          {/* admins are demoted by another admin before they can leave */}
          {!isAdmin && <DeleteAccountCard />}
        </TabsContent>
      </Tabs>
    </div>
  )
}
