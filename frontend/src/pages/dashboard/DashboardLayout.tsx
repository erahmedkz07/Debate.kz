import { Link, NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LayoutGrid, Plus } from 'lucide-react'
import { Logo } from '@/components/brand'
import { LangSwitch, ThemeToggle } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function DashboardLayout() {
  const { t } = useTranslation()
  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="ml-6 hidden items-center gap-1 md:flex">
            <NavLink to="/dashboard" end className={({ isActive }) => cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold', isActive ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:text-foreground')}>
              <LayoutGrid className="size-4" />{t('dashboard.myTournaments')}
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm" className="hidden sm:inline-flex"><Link to="/dashboard/tournaments/new"><Plus className="size-4" />{t('nav.createTournament')}</Link></Button>
            <LangSwitch className="hidden sm:flex" />
            <ThemeToggle />
            <span className="grid size-9 place-items-center rounded-full bg-accent text-sm font-extrabold text-navy" title="Аргын">А</span>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
