import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Menu, Moon, Plus, Sun } from 'lucide-react'
import { Logo } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger, SheetContent } from '@/components/ui/dialog'
import { useTheme } from '@/lib/hooks'
import { cn } from '@/lib/utils'

const links = [
  { to: '/', key: 'home' },
  { to: '/tournaments', key: 'tournaments' },
  { to: '/rating', key: 'rating' },
  { to: '/about', key: 'about' },
  { to: '/pricing', key: 'pricing' },
] as const

export function LangSwitch({ className, onDark }: { className?: string; onDark?: boolean }) {
  const { i18n } = useTranslation()
  return (
    <div className={cn('flex rounded-xl p-1 text-xs font-bold', onDark ? 'bg-white/15' : 'bg-muted', className)} role="group" aria-label="Language">
      {(['ru', 'kz'] as const).map(l => (
        <button
          key={l}
          onClick={() => i18n.changeLanguage(l)}
          aria-pressed={i18n.language === l}
          className={cn('cursor-pointer rounded-lg px-2.5 py-1.5 uppercase transition-all', i18n.language === l ? 'bg-card text-primary shadow-sm' : onDark ? 'text-white/80 hover:text-white' : 'text-muted-foreground hover:text-foreground')}
        >
          {l === 'kz' ? 'Қаз' : 'Рус'}
        </button>
      ))}
    </div>
  )
}

export function ThemeToggle({ onDark }: { onDark?: boolean }) {
  const { t } = useTranslation()
  const { dark, toggle } = useTheme()
  return (
    <Button variant="ghost" size="icon" onClick={toggle} className={cn(onDark && 'text-white hover:bg-white/10')} aria-label={t('nav.toggleTheme')} title={t('nav.toggleTheme')}>
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  )
}

export function Header() {
  const { t } = useTranslation()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => setOpen(false), [pathname])

  // pages that start with a dark photo hero: light header text until the user scrolls
  const onDark = !scrolled && /^\/(tournaments\/[^/]+|about)\/?$/.test(pathname)

  return (
    <header className={cn('sticky top-0 z-40 transition-all duration-300', scrolled ? 'border-b border-border bg-background/85 shadow-sm backdrop-blur-lg' : 'bg-transparent')}>
      <div className="container-page flex h-16 items-center justify-between gap-4 lg:h-18">
        <Logo inverted={onDark} />

        <nav className="hidden items-center gap-1 lg:flex">
          {links.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) => cn('relative rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors hover:text-primary', isActive ? (onDark ? 'text-white' : 'text-primary') : onDark ? 'text-white/80 hover:text-white' : 'text-foreground/80')}
            >
              {({ isActive }) => (
                <>
                  {t(`nav.${l.key}`)}
                  {isActive && <span className="absolute inset-x-3.5 -bottom-0.5 h-0.5 rounded-full bg-accent" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <LangSwitch onDark={onDark} />
          <ThemeToggle onDark={onDark} />
          <Button asChild variant="ghost" className={cn(onDark && 'text-white hover:bg-white/10')}><Link to="/login">{t('nav.login')}</Link></Button>
          <Button asChild><Link to="/dashboard/tournaments/new"><Plus className="size-4" />{t('nav.createTournament')}</Link></Button>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <LangSwitch onDark={onDark} />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('nav.menu')} className={cn(onDark && 'text-white hover:bg-white/10')}><Menu className="size-6" /></Button>
            </DialogTrigger>
            <SheetContent heading={t('nav.menu')}>
              <nav className="flex flex-col gap-1">
                {links.map(l => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.to === '/'}
                    className={({ isActive }) => cn('rounded-xl px-4 py-3 text-base font-semibold', isActive ? 'bg-primary-soft text-primary' : 'hover:bg-muted')}
                  >
                    {t(`nav.${l.key}`)}
                  </NavLink>
                ))}
                <NavLink to="/dashboard" className="rounded-xl px-4 py-3 text-base font-semibold hover:bg-muted">{t('nav.dashboard')}</NavLink>
              </nav>
              <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
                <Button asChild size="lg"><Link to="/dashboard/tournaments/new"><Plus className="size-4" />{t('nav.createTournament')}</Link></Button>
                <Button asChild variant="outline" size="lg"><Link to="/login">{t('nav.login')}</Link></Button>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm font-semibold text-muted-foreground">{t('nav.toggleTheme')}</span>
                  <ThemeToggle />
                </div>
              </div>
            </SheetContent>
          </Dialog>
        </div>
      </div>
    </header>
  )
}
