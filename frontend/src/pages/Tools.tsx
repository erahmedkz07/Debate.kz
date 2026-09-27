import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, BookOpen, Calculator, Library, Newspaper, Scale, Timer, UserPlus, Users } from 'lucide-react'
import { PageHeader } from '@/components/layout/Layout'
import { Reveal } from '@/components/motion'

// "Materials": one entry point for every tool and reference page
const tools = [
  { to: '/timer', key: 'timer', icon: Timer },
  { to: '/calculator', key: 'calculator', icon: Calculator },
  { to: '/formats', key: 'formats', icon: Scale },
  { to: '/reference', key: 'reference', icon: BookOpen },
  { to: '/motions', key: 'motions', icon: Library },
  { to: '/news', key: 'news', icon: Newspaper },
  { to: '/clubs', key: 'clubs', icon: Users },
  { to: '/teammates', key: 'teammates', icon: UserPlus },
] as const

export default function Tools() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('tools.title')} subtitle={t('tools.subtitle')} />
      <div className="container-page py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tools.map(({ to, key, icon: Icon }, i) => (
            <Reveal key={to} delay={i * 0.04}>
              <Link to={to} className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><Icon className="size-6" /></span>
                <h2 className="mt-4 text-lg font-bold">{t(`tools.items.${key}.title`)}</h2>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">{t(`tools.items.${key}.text`)}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">{t('tools.open')}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </>
  )
}
