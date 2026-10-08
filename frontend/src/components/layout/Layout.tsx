import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Header } from './Header'
import { Footer } from './Footer'

export function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
  }, [pathname, hash])
  return null
}

// The browser tab says which page is open: "<the page's heading> — Debate.kz" (the home page keeps the site's name).
// The heading is read from the page itself, so every page, a tournament or a person, gets its own title without each
// page setting it; it follows the language and data that arrive later.
export function TitleSync() {
  const { pathname } = useLocation()
  const { t, i18n } = useTranslation()
  useEffect(() => {
    const site = t('meta.siteTitle')
    const apply = () => {
      const h1 = document.querySelector('main h1, h1')?.textContent?.trim()
      const title = pathname === '/' || !h1 ? site : `${h1.length > 60 ? `${h1.slice(0, 57)}…` : h1} — Debate.kz`
      if (document.title !== title) document.title = title // the observer fires often (timers): touch the tab only on change
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [pathname, i18n.language, t])
  return null
}

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

// `back`: a back button above the title (pages people reach from a list or a hub)
// `media`: an optional picture beside the title (a club's logo)
export function PageHeader({ title, subtitle, children, back, media }: { title: string; subtitle?: string; children?: React.ReactNode; back?: React.ReactNode; media?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary-soft to-background">
      <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-accent/25 blur-3xl" />
      <div className={back ? 'container-page relative pb-12 pt-4 sm:pb-16 sm:pt-6' : 'container-page relative py-12 sm:py-16'}>
        {back && <div className="-ml-1 mb-4">{back}</div>}
        <div className={media ? 'flex items-center gap-4 sm:gap-6' : undefined}>
          {media}
          <div className="min-w-0">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
            {subtitle && <p className="mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
    </section>
  )
}
