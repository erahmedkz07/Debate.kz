import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AlertTriangle, Ban, Check, CheckCircle2, CircleDollarSign, Clock, ExternalLink, Eye, EyeOff, Gavel, History, LayoutGrid, Search, ShieldCheck, Trophy, Unlock, UserCog, Users, X } from 'lucide-react'
import { getAdminActions, getAdminStats, getAdminTournaments, getUsers, updateAdminTournament, updateUser } from '@/api'
import { errorMessage } from '@/lib/errors'
import type { AdminTournament, JudgeLevel, Role, User } from '@/types'
import { LevelBadge } from '@/components/judge/LevelBadge'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { cn, formatDate, formatDateRange, formatDateTime } from '@/lib/utils'
import { Avatar } from '@/components/auth/UserMenu'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Input, Label, Textarea } from '@/components/ui/input'
import { ModerationBadge } from '@/components/tournament/ModerationBadge'
import { Select } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import { CabinetHeader } from '@/pages/dashboard/DashboardLayout'

// only two global roles; organizer/judge are per-tournament rights
const roles: Role[] = ['user', 'admin']

function Overview({ tournaments, setTab }: { tournaments: AdminTournament[]; setTab: (v: string) => void }) {
  const { t } = useTranslation()
  const { data } = useAsync(getAdminStats)
  const unpaid = tournaments.filter(x => x.plan === 'pro' && !x.paid && x.moderation === 'approved')
  const pending = tournaments.filter(x => x.moderation === 'pending')
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
        {unpaid.length === 0 && pending.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t('admin.allGood')}</p> : (
          <ul className="mt-4 divide-y divide-border">
            {pending.map(x => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{x.name}</p>
                  <p className="text-xs text-muted-foreground">{x.owner?.name} · {x.owner?.email} · {x.city}</p>
                </div>
                <Button size="sm" variant="accent" onClick={() => setTab('tournaments')}><Clock className="size-4" />{t('admin.reviewNow')}</Button>
              </li>
            ))}
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
  const [rejecting, setRejecting] = useState<AdminTournament | null>(null)
  const [reason, setReason] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'unpaid'>('all')
  const query = q.trim().toLowerCase()
  const shown = [...list]
    .filter(x => filter === 'all' || (filter === 'unpaid' ? x.plan === 'pro' && !x.paid : x.moderation === filter))
    .filter(x => !query || [x.name, x.city, x.owner?.name, x.owner?.email].some(v => v?.toLowerCase().includes(query)))
    // pending moderation first: that is what the admin has to act on
    .sort((a, b) => Number(b.moderation === 'pending') - Number(a.moderation === 'pending'))
  // server first, then local list; returns false on error
  const patch = async (id: string, p: { paid?: boolean; visible?: boolean; moderation?: 'approved' | 'rejected'; moderationNote?: string }) => {
    try {
      const updated = await updateAdminTournament(id, p)
      setList(list.map(x => (x.id === id ? { ...x, ...updated } : x)))
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
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t('admin.searchTournaments')} className="pl-10" aria-label={t('common.search')} />
        </div>
        <Select className="w-52" value={filter} onValueChange={v => setFilter(v as typeof filter)} aria-label={t('admin.moderationCol')}
          options={[
            { value: 'all', label: t('admin.allTournaments') },
            { value: 'pending', label: t('moderation.pending') },
            { value: 'approved', label: t('moderation.approved') },
            { value: 'rejected', label: t('moderation.rejected') },
            { value: 'unpaid', label: t('admin.awaitingPayment') },
          ]} />
      </div>
      {shown.length === 0 ? <EmptyState icon={<Trophy className="size-7" />} title={t('tournaments.emptyTitle')} /> : (
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-3">{t('admin.tournament')}</th>
              <th className="px-5 py-3">{t('admin.owner')}</th>
              <th className="px-5 py-3">{t('admin.moderationCol')}</th>
              <th className="px-5 py-3">{t('common.team')}</th>
              <th className="px-5 py-3">{t('dashboard.settings.plan')}</th>
              <th className="px-5 py-3 text-right">{t('admin.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map(x => (
              <tr key={x.id} className={cn('hover:bg-muted/40', !x.visible && 'opacity-50', x.moderation === 'pending' && 'bg-accent-soft/40')}>
                <td className="px-5 py-3.5">
                  <p className="font-bold">{x.name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><StatusDot status={x.status} />{t(`status.${x.status}`)} · {formatDateRange(x.startDate, x.endDate)}</p>
                </td>
                <td className="px-5 py-3.5">
                  <p className="text-sm">{x.owner?.name ?? x.organizer}</p>
                  {x.owner && <p className="text-xs text-muted-foreground">{x.owner.email}</p>}
                </td>
                <td className="px-5 py-3.5">
                  {x.moderation === 'approved' ? <Badge variant="success"><CheckCircle2 className="size-3" />{t('moderation.approved')}</Badge> : <ModerationBadge status={x.moderation} />}
                </td>
                <td className="px-5 py-3.5 tabular-nums">{x.teamsCount}/{x.maxTeams}</td>
                <td className="px-5 py-3.5">
                  {x.plan === 'free'
                    ? <Badge variant="muted">{t('pricing.free')}</Badge>
                    : x.paid ? <Badge variant="success"><CheckCircle2 className="size-3" />Pro · {t('admin.paid')}</Badge>
                      : <Badge variant="accent"><CircleDollarSign className="size-3" />Pro · {t('admin.unpaid')}</Badge>}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex justify-end gap-1">
                    {x.moderation === 'pending' && (
                      <>
                        <Button size="sm" onClick={async () => { if (await patch(x.id, { moderation: 'approved' })) toast.success(t('admin.approvedToast')) }}>
                          <Check className="size-4" />{t('admin.approve')}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-danger" onClick={() => { setRejecting(x); setReason('') }}>
                          <X className="size-4" />{t('admin.reject')}
                        </Button>
                      </>
                    )}
                    {x.moderation === 'approved' && x.plan === 'pro' && !x.paid && <Button size="sm" variant="accent" onClick={() => setConfirm(x)}>{t('admin.markPaid')}</Button>}
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
      )}
      <Dialog open={!!rejecting} onOpenChange={o => !o && setRejecting(null)}>
        <DialogContent heading={t('admin.rejectTitle')} description={rejecting?.name}>
          <form className="space-y-4" onSubmit={async e => {
            e.preventDefault()
            if (reason.trim().length < 5) return
            if (await patch(rejecting!.id, { moderation: 'rejected', moderationNote: reason.trim() })) { setRejecting(null); toast(t('admin.rejectedToast')) }
          }}>
            <div>
              <Label htmlFor="reject-reason">{t('admin.rejectReason')}</Label>
              <Textarea id="reject-reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder={t('admin.rejectPlaceholder')} />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
              <Button type="submit" variant="danger" disabled={reason.trim().length < 5}><X className="size-4" />{t('admin.reject')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
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
  const patch = async (id: string, p: { role?: Role; blocked?: boolean; judgeLevelMin?: JudgeLevel | null }) => {
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
      {shown.length === 0 ? <EmptyState icon={<Users className="size-7" />} title={t('admin.noUsers')} /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-muted/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3">{t('admin.user')}</th>
                <th className="px-5 py-3">{t('common.institution')}</th>
                <th className="px-5 py-3">{t('admin.registered')}</th>
                <th className="px-5 py-3">{t('admin.role')}</th>
                <th className="px-5 py-3">{t('admin.judgeLevel')}</th>
                <th className="px-5 py-3 text-right">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map(u => (
                <tr key={u.id} className={cn('hover:bg-muted/40', u.blocked && 'bg-danger-soft/40')}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} role={u.role} src={u.avatarUrl} />
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
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <LevelBadge level={u.judgeLevel} />
                      {/* a floor for experienced judges who are new to the platform; the earned level can still be higher */}
                      <Select size="sm" className="w-36" value={u.judgeLevelMin ?? 'auto'} aria-label={t('admin.judgeLevelMin')}
                        onValueChange={async v => {
                          if (await patch(u.id, { judgeLevelMin: v === 'auto' ? null : (v as JudgeLevel) })) toast.success(t('admin.judgeLevelChanged', { name: u.name }))
                        }}
                        options={[{ value: 'auto', label: t('admin.levelAuto') }, ...(['judge', 'experienced', 'chief'] as const).map(l => ({ value: l, label: `≥ ${t(`judgeLevel.${l}`)}` }))]} />
                    </div>
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

// audit log: who approved, rejected, marked paid, hid, blocked or changed a role
const actionIcon: Record<string, typeof Check> = {
  'tournament.approve': CheckCircle2, 'tournament.reject': X, 'tournament.paid': CircleDollarSign, 'tournament.unpaid': CircleDollarSign,
  'tournament.show': Eye, 'tournament.hide': EyeOff, 'user.role': UserCog, 'user.block': Ban, 'user.unblock': Unlock, 'user.judgeLevel': Gavel,
}
const actionColor = (a: string) => (a.endsWith('reject') || a.endsWith('block') || a.endsWith('hide') ? 'bg-danger-soft text-danger'
  : a.endsWith('approve') || a.endsWith('paid') || a.endsWith('unblock') || a.endsWith('show') ? 'bg-success-soft text-success' : 'bg-primary-soft text-primary')

function LogTab() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(getAdminActions)
  if (error) return <ErrorState onRetry={reload} />
  if (loading || !data) return <Skeleton className="h-96" />
  if (data.length === 0) return <EmptyState icon={<History className="size-7" />} title={t('admin.log.empty')} text={t('admin.log.emptyText')} />
  return (
    <Card className="divide-y divide-border">
      {data.map(a => {
        const Icon = actionIcon[a.action] ?? ShieldCheck
        return (
          <div key={a.id} className="flex items-start gap-4 px-5 py-4">
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', actionColor(a.action))}><Icon className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <b>{a.adminName}</b> {t(`admin.log.actions.${a.action}`, { defaultValue: a.action })}{' '}
                {a.targetType === 'tournament'
                  ? <Link to={`/tournaments/${a.targetId}`} className="font-semibold text-primary hover:underline">«{a.targetLabel}»</Link>
                  : <span className="font-semibold">{a.targetLabel}</span>}
                {a.action === 'user.role' && a.note && <> → {t(`roles.${a.note}`)}</>}
                {a.action === 'user.judgeLevel' && a.note && <> → {a.note === 'auto' ? t('admin.levelAuto') : `≥ ${t(`judgeLevel.${a.note}`)}`}</>}
              </p>
              {a.action === 'tournament.reject' && a.note && <p className="mt-1 text-xs text-muted-foreground">{t('admin.log.reason')}: {a.note}</p>}
            </div>
            <time className="shrink-0 text-xs text-muted-foreground" dateTime={a.createdAt}>{formatDateTime(a.createdAt)}</time>
          </div>
        )
      })}
    </Card>
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
          <TabsTrigger value="log">{t('admin.log.tab')}</TabsTrigger>
        </TabsList>
        {error ? <div className="mt-6"><ErrorState onRetry={reload} /></div> : loading || !data ? <Skeleton className="mt-6 h-96" /> : (
          <>
            <TabsContent value="overview"><Overview tournaments={list} setTab={setTab} /></TabsContent>
            <TabsContent value="tournaments"><TournamentsTab list={list} setList={setList} /></TabsContent>
            <TabsContent value="users"><UsersTab /></TabsContent>
            <TabsContent value="log"><LogTab /></TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}
