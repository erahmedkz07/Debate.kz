import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AlertTriangle, Ban, CheckCircle2, CircleDollarSign, ExternalLink, Eye, EyeOff, Gavel, LayoutGrid, Search, Trophy, Unlock, Users } from 'lucide-react'
import { getAdminStats, getAdminTournaments, getUsers, updateAdminTournament, updateUser } from '@/api'
import { errorMessage } from '@/lib/errors'
import type { AdminTournament, Role, User } from '@/types'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { cn, formatDate, formatDateRange } from '@/lib/utils'
import { Avatar } from '@/components/auth/UserMenu'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import { CabinetHeader } from '@/pages/dashboard/DashboardLayout'

const roles: Role[] = ['participant', 'organizer', 'judge', 'admin']

function Overview({ tournaments, setTab }: { tournaments: AdminTournament[]; setTab: (v: string) => void }) {
  const { t } = useTranslation()
  const { data } = useAsync(getAdminStats)
  const unpaid = tournaments.filter(x => x.plan === 'pro' && !x.paid)
  const cards = [
    { label: t('admin.stats.users'), value: data?.users, icon: Users, color: 'bg-primary-soft text-primary' },
    { label: t('admin.stats.organizers'), value: data?.organizers, icon: LayoutGrid, color: 'bg-accent-soft text-navy dark:text-accent' },
    { label: t('admin.stats.judges'), value: data?.judges, icon: Gavel, color: 'bg-success-soft text-success' },
    { label: t('admin.stats.active'), value: data && `${data.active}/${data.tournaments}`, icon: Trophy, color: 'bg-danger-soft text-danger' },
  ]
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-5">
            <span className={cn('grid size-10 place-items-center rounded-xl', color)}><Icon className="size-5" /></span>
            <p className="mt-4 text-3xl font-extrabold tabular-nums">{value ?? '—'}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-6 p-6">
        <h3 className="flex items-center gap-2 text-lg font-bold"><AlertTriangle className="size-5 text-accent-foreground dark:text-accent" />{t('admin.attention')}</h3>
        {unpaid.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t('admin.allGood')}</p> : (
          <ul className="mt-4 divide-y divide-border">
            {unpaid.map(x => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{x.name}</p>
                  <p className="text-xs text-muted-foreground">{x.organizer} · {t('admin.teamsLimit', { count: x.maxTeams })}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setTab('tournaments')}><CircleDollarSign className="size-4" />{t('admin.awaitingPayment')}</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

function TournamentsTab({ list, setList }: { list: AdminTournament[]; setList: (l: AdminTournament[]) => void }) {
  const { t } = useTranslation()
  const [confirm, setConfirm] = useState<AdminTournament | null>(null)
  // server first, then local list; returns false on error
  const patch = async (id: string, p: { paid?: boolean; visible?: boolean }) => {
    try {
      const updated = await updateAdminTournament(id, p)
      setList(list.map(x => (x.id === id ? updated : x)))
      return true
    } catch (e) {
      toast.error(errorMessage(e, t))
      return false
    }
  }
  return (
    <>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-3">{t('admin.tournament')}</th>
              <th className="px-5 py-3">{t('tournament.organizer')}</th>
              <th className="px-5 py-3">{t('common.team')}</th>
              <th className="px-5 py-3">{t('dashboard.settings.plan')}</th>
              <th className="px-5 py-3 text-right">{t('admin.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map(x => (
              <tr key={x.id} className={cn('hover:bg-muted/40', !x.visible && 'opacity-50')}>
                <td className="px-5 py-3.5">
                  <p className="font-bold">{x.name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><StatusDot status={x.status} />{t(`status.${x.status}`)} · {formatDateRange(x.startDate, x.endDate)}</p>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">{x.organizer}</td>
                <td className="px-5 py-3.5 tabular-nums">{x.teamsCount}/{x.maxTeams}</td>
                <td className="px-5 py-3.5">
                  {x.plan === 'free'
                    ? <Badge variant="muted">{t('pricing.free')}</Badge>
                    : x.paid ? <Badge variant="success"><CheckCircle2 className="size-3" />Pro · {t('admin.paid')}</Badge>
                      : <Badge variant="accent"><CircleDollarSign className="size-3" />Pro · {t('admin.unpaid')}</Badge>}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex justify-end gap-1">
                    {x.plan === 'pro' && !x.paid && <Button size="sm" variant="accent" onClick={() => setConfirm(x)}>{t('admin.markPaid')}</Button>}
                    <Button variant="ghost" size="icon" title={x.visible ? t('admin.hide') : t('admin.show')} aria-label={x.visible ? t('admin.hide') : t('admin.show')}
                      onClick={async () => { if (await patch(x.id, { visible: !x.visible })) toast(x.visible ? t('admin.hidden') : t('admin.shown')) }}>
                      {x.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </Button>
                    <Button asChild variant="ghost" size="icon" aria-label={t('dashboard.public')} title={t('dashboard.public')}>
                      <Link to={`/tournaments/${x.id}`}><ExternalLink className="size-4" /></Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Dialog open={!!confirm} onOpenChange={o => !o && setConfirm(null)}>
        <DialogContent heading={t('admin.markPaidTitle')} description={confirm?.name}>
          <p className="text-sm text-muted-foreground">{t('admin.markPaidText')}</p>
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button onClick={async () => { if (await patch(confirm!.id, { paid: true })) { setConfirm(null); toast.success(t('admin.paidDone')) } }}>
              <CheckCircle2 className="size-4" />{t('admin.markPaid')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function UsersTab() {
  const { t } = useTranslation()
  const { user: me } = useAuth()
  const { data, loading, error, reload } = useAsync(getUsers)
  const [list, setList] = useState<User[]>([])
  const [q, setQ] = useState('')
  const [role, setRole] = useState<'all' | Role>('all')
  useEffect(() => { if (data) setList(data) }, [data])

  if (error) return <ErrorState onRetry={reload} />
  if (loading || !data) return <Skeleton className="h-96" />

  const shown = list.filter(u => (role === 'all' || u.role === role) &&
    (!q || u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase())))
  const patch = async (id: string, p: { role?: Role; blocked?: boolean }) => {
    try {
      const updated = await updateUser(id, p)
      setList(list.map(u => (u.id === id ? updated : u)))
      return true
    } catch (e) {
      toast.error(errorMessage(e, t))
      return false
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t('admin.searchUsers')} className="pl-10" aria-label={t('common.search')} />
        </div>
        <Select className="w-52" value={role} onValueChange={v => setRole(v as typeof role)} aria-label={t('auth.role')}
          options={[{ value: 'all', label: t('admin.allRoles') }, ...roles.map(r => ({ value: r, label: t(`roles.${r}`) }))]} />
      </div>
      {shown.length === 0 ? <EmptyState title={t('tournaments.emptyTitle')} /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3">{t('admin.user')}</th>
                <th className="px-5 py-3">{t('common.institution')}</th>
                <th className="px-5 py-3">{t('admin.registered')}</th>
                <th className="px-5 py-3">{t('admin.role')}</th>
                <th className="px-5 py-3 text-right">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map(u => (
                <tr key={u.id} className={cn('hover:bg-muted/40', u.blocked && 'bg-danger-soft/40')}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} role={u.role} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-bold">{u.name}{u.blocked && <Badge variant="danger">{t('admin.blocked')}</Badge>}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{[u.institution, u.city].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(u.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-5 py-3">
                    <Select size="sm" className="w-40" value={u.role} disabled={u.id === me?.id} aria-label={t('auth.role')}
                      onValueChange={async v => { if (await patch(u.id, { role: v as Role })) toast.success(t('admin.roleChanged', { name: u.name, role: t(`roles.${v}`) })) }}
                      options={roles.map(r => ({ value: r, label: t(`roles.${r}`) }))} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    {u.id !== me?.id && (
                      <Button size="sm" variant="ghost" className={u.blocked ? 'text-success' : 'text-danger'}
                        onClick={async () => { if (await patch(u.id, { blocked: !u.blocked })) toast(u.blocked ? t('admin.unblockedToast') : t('admin.blockedToast')) }}>
                        {u.blocked ? <><Unlock className="size-4" />{t('admin.unblock')}</> : <><Ban className="size-4" />{t('admin.block')}</>}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}

export default function AdminPanel() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(getAdminTournaments)
  const [list, setList] = useState<AdminTournament[]>([])
  const [tab, setTab] = useState('overview')
  useEffect(() => { if (data) setList(data) }, [data])

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6">
      <CabinetHeader title={t('admin.title')} subtitle={t('admin.subtitle')} />
      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList className="w-fit">
          <TabsTrigger value="overview">{t('dashboard.nav.overview')}</TabsTrigger>
          <TabsTrigger value="tournaments">{t('nav.tournaments')}</TabsTrigger>
          <TabsTrigger value="users">{t('admin.users')}</TabsTrigger>
        </TabsList>
        {error ? <div className="mt-6"><ErrorState onRetry={reload} /></div> : loading || !list.length ? <Skeleton className="mt-6 h-96" /> : (
          <>
            <TabsContent value="overview"><Overview tournaments={list} setTab={setTab} /></TabsContent>
            <TabsContent value="tournaments"><TournamentsTab list={list} setList={setList} /></TabsContent>
            <TabsContent value="users"><UsersTab /></TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}
