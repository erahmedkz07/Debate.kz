import { Component, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

// A crash while drawing one page must not leave a white screen: the visitor gets a message and a way out.
// A new page (another address) starts clean. A failed lazy chunk (the site was updated) is fixed by a reload.
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error(error)
  }
  render() {
    return this.state.failed ? <Fallback /> : this.props.children
  }
}

function Fallback() {
  const { t } = useTranslation()
  return (
    <section className="container-page grid min-h-[60vh] place-items-center py-16 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-20 place-items-center rounded-3xl bg-danger-soft text-danger"><TriangleAlert className="size-10" /></span>
        <h1 className="mt-6 text-2xl font-extrabold">{t('crash.title')}</h1>
        <p className="mt-3 text-muted-foreground">{t('crash.text')}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={() => location.reload()}><RefreshCw className="size-4" />{t('crash.reload')}</Button>
          <Button asChild variant="outline"><a href="/">{t('notFound.home')}</a></Button>
        </div>
      </div>
    </section>
  )
}

export function ErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <Boundary key={pathname}>{children}</Boundary>
}
