import { Link, NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Globe, Plus } from 'lucide-react'
import { Logo } from '@/components/brand'
import { LangSwitch, ThemeToggle } from '@/components/layout/Header'
import { UserMenu, cabinetLinks } from '@/components/auth/UserMenu'
import { EmailBanner } from '@/components/auth/EmailBanner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

// App shell for every cabinet; nav depends on what the user does (organizes, judges, admin)
export default function DashboardLayout() {
  const { t } = useTranslation()
  const { user } = useAuth()
  if (!user) return null
  const links = cabinetLinks(user)
  const canCreate = true // anyone can create a tournament

  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {links.map(({ to, key, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/me'}
                className={({ isActive }) => cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors', isActive ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="size-4" />{t(`cabinet.${key}`)}
              </NavLink>
            ))}
            <Link to="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
              <Globe className="size-4" />{t('cabinet.site')}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {canCreate && <Button asChild size="sm" className="hidden sm:inline-flex"><Link to="/dashboard/tournaments/new"><Plus className="size-4" />{t('nav.createTournament')}</Link></Button>}
            <LangSwitch className="hidden sm:flex" />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
        {/* mobile cabinet nav */}
        <nav className="flex gap-1 overflow-x-auto border-t border-border px-4 py-2 [scrollbar-width:none] md:hidden">
          {links.map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/me'}
              className={({ isActive }) => cn('flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold', isActive ? 'bg-primary-soft text-primary' : 'text-muted-foreground')}>
              <Icon className="size-4" />{t(`cabinet.${key}`)}
            </NavLink>
          ))}
          <Link to="/" className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground"><Globe className="size-4" />{t('cabinet.site')}</Link>
        </nav>
      </header>
      <EmailBanner />
      <Outlet />
    </div>
  )
}

export function CabinetHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
