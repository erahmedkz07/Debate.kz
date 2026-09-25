import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell } from 'lucide-react'
import { getUnreadCount } from '@/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

// the bell polls the unread counter every minute and after every page change
export function NotificationBell({ onDark }: { onDark?: boolean }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!user) return
    let alive = true
    const load = () => getUnreadCount().then(n => { if (alive) setCount(n) }).catch(() => undefined)
    load()
    const timer = setInterval(load, 60_000)
    // the notifications page tells the bell when something was read
    window.addEventListener('notifications:changed', load)
    return () => { alive = false; clearInterval(timer); window.removeEventListener('notifications:changed', load) }
  }, [user, pathname])
  if (!user) return null
  const label = count ? t('notifications.bellUnread', { count }) : t('notifications.title')
  return (
    <Link to="/notifications" aria-label={label} title={label}
      className={cn('relative grid size-10 place-items-center rounded-full transition-colors', onDark ? 'text-white hover:bg-white/10' : 'text-foreground hover:bg-muted')}>
      <Bell className="size-5" />
      {count > 0 && (
        <span className="absolute right-1 top-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
