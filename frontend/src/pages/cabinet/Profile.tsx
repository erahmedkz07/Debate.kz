import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Building2, CalendarDays, CheckCircle2, ChevronRight, DoorOpen, KeyRound, Mail, MapPin, Phone, ShieldCheck, Star, Swords, Trash2, Trophy, Users } from 'lucide-react'
import { changePassword, deleteAccount, getMyDebates, getMyFeedback, getMyRegistrations, sendFeedback, updateProfile } from '@/api'
import { errorMessage } from '@/lib/errors'
import type { FeedbackItem, TeamRegistration } from '@/types'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { cn, formatDate, formatDateRange } from '@/lib/utils'
import { AvatarEditor } from '@/components/auth/AvatarEditor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Input, Label, Textarea } from '@/components/ui/input'
import { StarRating } from '@/components/ui/stars'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, Skeleton } from '@/components/ui/states'
import { OrnamentPattern } from '@/components/brand'

const regVariant: Record<TeamRegistration['status'], 'success' | 'accent' | 'danger'> = { confirmed: 'success', pending: 'accent', rejected: 'danger' }

// teams rate the judges of their debates; judges only ever see averages
function FeedbackDialog({ item, onClose, onSaved }: { item: FeedbackItem | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState<Record<string, { score: number; comment: string }>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (item) setForm(Object.fromEntries(item.judges.map(j => [j.judgeId, { score: j.given?.score ?? 0, comment: j.given?.comment ?? '' }])))
  }, [item])
  if (!item) return null
  const changed = item.judges.filter(j => {
    const f = form[j.judgeId]
    return f && f.score > 0 && (f.score !== j.given?.score || f.comment.trim() !== (j.given?.comment ?? ''))
  })
  const save = async () => {
    setBusy(true)
    try {
      for (const j of changed) {
        const f = form[j.judgeId]
        await sendFeedback(item.debateId, { judgeId: j.judgeId, score: f.score, comment: f.comment.trim() || undefined })
      }
      toast.success(t('feedback.saved'))
      onSaved()
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent heading={t('feedback.dialogTitle')} description={`${item.tournament.name} · ${item.round.name} · vs ${item.opponent.name}`}>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {item.judges.map(j => (
            <div key={j.judgeId} className="rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">{j.name}{j.isChair && <Badge variant="primary" className="ml-2">{t('tournament.chair')}</Badge>}</p>
                <StarRating label={t('feedback.scoreFor', { name: j.name })} value={form[j.judgeId]?.score ?? 0}
                  onChange={v => setForm(f => ({ ...f, [j.judgeId]: { ...f[j.judgeId], score: v } }))} />
              </div>
              <Textarea rows={2} className="mt-3" maxLength={500} placeholder={t('feedback.commentPlaceholder')} aria-label={t('feedback.comment')}
                value={form[j.judgeId]?.comment ?? ''} onChange={e => setForm(f => ({ ...f, [j.judgeId]: { ...f[j.judgeId], comment: e.target.value } }))} />
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />{t('feedback.privacy')}</p>
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
          <Button disabled={busy || changed.length === 0} onClick={save}>{t('feedback.send')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FeedbackCard() {
  const { t } = useTranslation()
  const { data, reload } = useAsync(getMyFeedback)
  const [open, setOpen] = useState<FeedbackItem | null>(null)
  if (!data?.length) return null
  const todo = data.filter(d => d.judges.some(j => !j.given)).length
  return (
    <Card className="mt-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold"><Star className="size-5 fill-accent text-accent" />{t('feedback.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('feedback.text')}</p>
        </div>
        {todo > 0 && <Badge variant="accent">{t('feedback.todo', { count: todo })}</Badge>}
      </div>
      <ul className="mt-4 divide-y divide-border">
        {data.map(item => {
          const done = item.judges.every(j => j.given)
          return (
            <li key={item.debateId} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{item.round.name} <span className="font-normal text-muted-foreground">vs</span> {item.opponent.name}</p>
                <p className="text-xs text-muted-foreground">{item.tournament.name} · {t(`profile.result.${item.result}`)} · {t('feedback.judgesCount', { count: item.judges.length })}</p>
              </div>
              <Button size="sm" variant={done ? 'ghost' : 'accent'} onClick={() => setOpen(item)}>
                {done ? <><CheckCircle2 className="size-4 text-success" />{t('feedback.edit')}</> : <><Star className="size-4" />{t('feedback.rate')}</>}
              </Button>
            </li>
          )
        })}
      </ul>
      <FeedbackDialog item={open} onClose={() => setOpen(null)} onSaved={reload} />
    </Card>
  )
}

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

      {!isAdmin && <FeedbackCard />}

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
