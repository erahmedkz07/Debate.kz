import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
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
