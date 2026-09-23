import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Building2, CalendarDays, DoorOpen, Mail, MapPin, Phone, Search, Swords, Trophy, Users } from 'lucide-react'
import { getMyDebates, getMyRegistrations, updateProfile } from '@/api'
import { errorMessage } from '@/lib/errors'
import type { TeamRegistration } from '@/types'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { cn, formatDate, formatDateRange } from '@/lib/utils'
import { AvatarEditor } from '@/components/auth/AvatarEditor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, Skeleton } from '@/components/ui/states'
import { OrnamentPattern } from '@/components/brand'

const regVariant: Record<TeamRegistration['status'], 'success' | 'accent' | 'danger'> = { confirmed: 'success', pending: 'accent', rejected: 'danger' }

export default function Profile() {
  const { t } = useTranslation()
  const { user, signIn } = useAuth()
  const regs = useAsync(getMyRegistrations, [user?.id])
  const debates = useAsync(getMyDebates, [user?.id])
  const [form, setForm] = useState({ name: user!.name, phone: user!.phone ?? '', institution: user!.institution ?? '', city: user!.city ?? '' })
  if (!user) return null

  const played = debates.data?.filter(d => d.result) ?? []
  const wins = played.filter(d => d.result === 'win').length
  const upcoming = debates.data?.filter(d => !d.result) ?? []

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6">
      {/* profile card */}
      <Card className="relative overflow-hidden">
        <div className="relative h-28 bg-gradient-to-r from-primary to-navy sm:h-32"><OrnamentPattern className="text-white/[0.07]" /></div>
        <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end">
          <AvatarEditor className="-mt-14 sm:-mt-16" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{user.name}</h1>
              {user.role === 'admin' && <Badge variant="danger">{t('roles.admin')}</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Mail className="size-4" />{user.email}</span>
              {user.phone && <span className="flex items-center gap-1.5"><Phone className="size-4" />{user.phone}</span>}
              {user.institution && <span className="flex items-center gap-1.5"><Building2 className="size-4" />{user.institution}</span>}
              {user.city && <span className="flex items-center gap-1.5"><MapPin className="size-4" />{user.city}</span>}
            </div>
          </div>
          <Button asChild variant="outline"><Link to="/tournaments"><Search className="size-4" />{t('home.audience.partCta')}</Link></Button>
        </div>
      </Card>

      {/* stats */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
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
      </div>

      <Tabs defaultValue="registrations" className="mt-8">
        <TabsList className="w-fit">
          <TabsTrigger value="registrations">{t('profile.tabs.registrations')}</TabsTrigger>
          <TabsTrigger value="debates">{t('profile.tabs.debates')}</TabsTrigger>
          <TabsTrigger value="settings">{t('profile.tabs.settings')}</TabsTrigger>
        </TabsList>

        <TabsContent value="registrations">
          {regs.loading || !regs.data ? <Skeleton className="h-40" /> : regs.data.length === 0 ? (
            <EmptyState icon={<Users className="size-7" />} title={t('profile.noRegs')} text={t('profile.noRegsText')}
              action={<Button asChild><Link to="/tournaments">{t('home.audience.partCta')}</Link></Button>} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {regs.data.map(r => (
                <Card key={r.id} className="flex gap-4 overflow-hidden p-0">
                  <img src={r.tournament.cover} alt="" className="w-28 shrink-0 object-cover sm:w-36" />
                  <div className="min-w-0 flex-1 py-4 pr-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link to={`/tournaments/${r.tournamentId}`} className="font-bold leading-snug hover:text-primary">{r.tournament.name}</Link>
                      <Badge variant={regVariant[r.status]}>{t(`profile.regStatus.${r.status}`)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateRange(r.tournament.startDate, r.tournament.endDate)} · {r.tournament.city}</p>
                    <p className="mt-3 text-sm"><b>{r.teamName}</b> <span className="text-muted-foreground">· {r.institution}</span></p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{r.speakers.join(', ')}</p>
                  </div>
                </Card>
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
                <Card key={d.debate.id} className="flex flex-wrap items-center gap-4 p-4">
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
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings">
          <Card className="max-w-2xl p-6">
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
