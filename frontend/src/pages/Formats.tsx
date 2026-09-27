import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Calculator, Clock, HelpCircle, Hourglass, MapPin, Scale, Timer, Users } from 'lucide-react'
import { FORMATS, formatById, type Speech } from '@/content/formats'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// who speaks: government-like sides use the primary colour, opposition-like — navy, cross-examination — amber
const sideLook: Record<Speech['side'], string> = {
  a: 'bg-primary text-primary-foreground', c: 'bg-primary/70 text-primary-foreground',
  b: 'bg-navy text-white', d: 'bg-navy/70 text-white', q: 'bg-accent text-navy',
}

export default function Formats() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const [params, setParams] = useSearchParams()
  const f = formatById(params.get('f') ?? '') ?? FORMATS[0]
  const total = f.speeches.reduce((s, x) => s + x.minutes, 0)

  return (
    <>
      <PageHeader title={t('formats.title')} subtitle={t('formats.subtitle')}>
        <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label={t('formats.title')}>
          {FORMATS.map(x => (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === f.id} onClick={() => setParams({ f: x.id }, { replace: true })}
              className={cn('cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold transition-colors', x.id === f.id ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-card text-muted-foreground hover:text-foreground')}>
              {x.name[lang]}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="container-page grid gap-6 py-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-6">
          <div className={cn('rounded-3xl bg-gradient-to-br p-6 text-white sm:p-8', f.accent)}>
            <p className="text-xs font-bold uppercase tracking-wider text-white/70">{f.short}</p>
            <h2 className="mt-1 text-2xl font-extrabold sm:text-3xl">{f.name[lang]}</h2>
            <p className="mt-3 flex items-center gap-2 text-sm text-white/85"><Users className="size-4" />{f.teams[lang]}</p>
            <p className="mt-4 max-w-2xl leading-relaxed text-white/90">{f.about[lang]}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild variant="white" size="sm"><Link to={`/timer?format=${f.id}`}><Timer className="size-4" />{t('formats.openTimer')}</Link></Button>
              <Button asChild variant="white" size="sm"><Link to={`/calculator?format=${f.id}`}><Calculator className="size-4" />{t('formats.openCalculator')}</Link></Button>
            </div>
          </div>

          <Card className="p-6">
            <h3 className="flex items-center gap-2 text-lg font-bold"><Clock className="size-5 text-primary" />{t('formats.order')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('formats.total', { minutes: total })}</p>
            <ol className="mt-5 space-y-2">
              {f.speeches.map((s, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="w-6 text-right text-xs font-bold text-muted-foreground">{i + 1}</span>
                  <span className={cn('flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold', sideLook[s.side])}>
                    <span className="truncate">{s.role[lang]}</span>
                    <span className="shrink-0 tabular-nums">{t('formats.min', { n: s.minutes })}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-4">
          {[
            { icon: HelpCircle, title: t('formats.poi'), text: f.poi[lang] },
            { icon: Scale, title: t('formats.judging'), text: f.judging[lang] },
            { icon: Hourglass, title: t('formats.prep'), text: f.prep[lang] },
            { icon: MapPin, title: t('formats.where'), text: f.where[lang] },
          ].map(({ icon: Icon, title, text }) => (
            <Card key={title} className="p-5">
              <h3 className="flex items-center gap-2 font-bold"><Icon className="size-4 text-primary" />{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </Card>
          ))}
          <p className="px-1 text-xs text-muted-foreground">{t('formats.note')}</p>
        </aside>
      </div>
    </>
  )
}
