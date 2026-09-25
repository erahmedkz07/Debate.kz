import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Bell, CheckCheck, Gavel, Globe, Inbox, LayoutGrid, Loader2, ShieldCheck, Users } from 'lucide-react'
import { getNotifications, getPlatformNotifications, markNotificationsRead } from '@/api'
import type { AppNotification } from '@/types'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { cn, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SideTabsList, SideTabsTrigger, Tabs } from '@/components/ui/tabs'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import { CabinetHeader } from '@/pages/dashboard/DashboardLayout'

// a notification's category is the first part of its type: participant.*, judge.*, organizer.*, admin.*
const CATEGORIES = ['participant', 'judge', 'organizer', 'admin'] as const
type Category = (typeof CATEGORIES)[number]
const look: Record<Category, { icon: typeof Bell; tile: string }> = {
  participant: { icon: Users, tile: 'bg-primary-soft text-primary' },
  judge: { icon: Gavel, tile: 'bg-success-soft text-success' },
  organizer: { icon: LayoutGrid, tile: 'bg-accent-soft text-navy dark:text-accent' },
  admin: { icon: ShieldCheck, tile: 'bg-danger-soft text-danger' },
}
const categoryOf = (type: string) => type.split('.')[0] as Category

// tell the bell in the header to refresh its counter
const changed = () => window.dispatchEvent(new Event('notifications:changed'))

export default function Notifications() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState('all')
  const mode = tab === 'platform' ? 'platform' : 'mine'
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [state, setState] = useState<'loading' | 'more' | 'ready' | 'error'>('loading')

  const load = async (more = false) => {
    setState(more ? 'more' : 'loading')
    try {
      const before = more ? items.at(-1)?.createdAt : undefined
      const page = mode === 'platform' ? await getPlatformNotifications(before) : await getNotifications(before)
      setItems(more ? [...items, ...page.items] : page.items)
      setHasMore(page.hasMore)
      if (page.unread !== undefined) setUnread(page.unread)
      setState('ready')
    } catch {
      setState('error')
    }
  }
  useEffect(() => { void load() }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // role-specific texts: side, judge role, invite kind and result are translated here
  const vars = (n: AppNotification) => {
    const d = n.data as Record<string, string | boolean | undefined>
    return {
      ...d,
      side: d.side ? t(`tournament.${d.side}`) : '',
      role: d.chair ? t('notifications.chair') : t('notifications.wing'),
      kind: d.kind ? t(`notifications.kind.${d.kind}`) : '',
      result: d.result ? t(`profile.result.${d.result}`) : '',
      plan: d.pro ? ' · Pro' : '',
    }
  }

  const open = async (n: AppNotification) => {
    if (mode === 'mine' && !n.read) {
      setItems(items.map(x => (x.id === n.id ? { ...x, read: true } : x)))
      setUnread(u => Math.max(0, u - 1))
      markNotificationsRead([n.id]).then(changed).catch(() => undefined)
    }
    if (n.link) navigate(n.link)
  }
  const readAll = async () => {
    try {
      await markNotificationsRead()
      setItems(items.map(x => ({ ...x, read: true })))
      setUnread(0)
      changed()
    } catch (e) {
      toast.error(errorMessage(e, t))
    }
  }

  // only the categories this person actually has, plus the platform feed for admins
  const present = new Set(mode === 'mine' ? items.map(n => categoryOf(n.type)) : [])
  const shown = tab === 'all' || tab === 'platform' ? items : items.filter(n => categoryOf(n.type) === tab)

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6">
      <CabinetHeader title={t('notifications.title')} subtitle={t('notifications.subtitle')}
        action={mode === 'mine' && unread > 0 && <Button variant="outline" onClick={readAll}><CheckCheck className="size-4" />{t('notifications.readAll')}</Button>} />
      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
          <SideTabsList aria-label={t('notifications.title')}>
            <SideTabsTrigger value="all">
              <Inbox className="size-4" />{t('notifications.all')}
              {unread > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">{unread}</span>}
            </SideTabsTrigger>
            {CATEGORIES.filter(c => present.has(c) || (tab === c)).map(c => {
              const Icon = look[c].icon
              return <SideTabsTrigger key={c} value={c}><Icon className="size-4" />{t(`notifications.categories.${c}`)}</SideTabsTrigger>
            })}
            {isAdmin && <SideTabsTrigger value="platform"><Globe className="size-4" />{t('notifications.platform')}</SideTabsTrigger>}
          </SideTabsList>

          <div className="min-w-0">
            {mode === 'platform' && <p className="mb-3 text-sm text-muted-foreground">{t('notifications.platformHint')}</p>}
            {state === 'error' ? <ErrorState onRetry={() => load()} /> : state === 'loading' ? <Skeleton className="h-96" /> : shown.length === 0 ? (
              <EmptyState icon={<Bell className="size-7" />} title={t('notifications.empty')} text={t('notifications.emptyText')} />
            ) : (
              <>
                <Card className="divide-y divide-border overflow-hidden">
                  {shown.map(n => {
                    const cat = categoryOf(n.type)
                    const { icon: Icon, tile } = look[cat] ?? look.participant
                    const v = vars(n)
                    return (
                      <button key={n.id} type="button" onClick={() => open(n)}
                        className={cn('flex w-full cursor-pointer items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50',
                          mode === 'mine' && !n.read && 'bg-primary-soft/40')}>
                        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tile)}><Icon className="size-5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
                            <span className="font-semibold">{t(`notifications.types.${n.type}.title`, v)}</span>
                            <time className="shrink-0 text-xs text-muted-foreground" dateTime={n.createdAt}>{formatDateTime(n.createdAt)}</time>
                          </span>
                          <span className="mt-0.5 block text-sm text-muted-foreground">{t(`notifications.types.${n.type}.text`, v)}</span>
                          {n.recipient && <span className="mt-1 block text-xs text-muted-foreground">→ {n.recipient.name} · {n.recipient.email}</span>}
                        </span>
                        {mode === 'mine' && !n.read && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-primary" aria-label={t('notifications.unread')} />}
                      </button>
                    )
                  })}
                </Card>
                {hasMore && (
                  <div className="mt-4 flex justify-center">
                    <Button variant="outline" disabled={state === 'more'} onClick={() => load(true)}>
                      {state === 'more' && <Loader2 className="size-4 animate-spin" />}{t('notifications.more')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Tabs>
    </div>
  )
}
