import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, BookOpen, Lightbulb, Scale } from 'lucide-react'
import { GLOSSARY, JUDGING, TIPS } from '@/content/reference'
import { PageHeader } from '@/components/layout/Layout'
import { Card } from '@/components/ui/card'
import { BackButton } from '@/components/layout/BackButton'

export default function Reference() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  return (
    <>
      <PageHeader title={t('reference.title')} subtitle={t('reference.subtitle')} back={<BackButton fallback="/tools" />} />
      <div className="container-page space-y-12 py-10">
        <section>
          <h2 className="flex items-center gap-2 text-2xl font-extrabold"><BookOpen className="size-6 text-primary" />{t('reference.glossary')}</h2>
          <dl className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {GLOSSARY.map(g => (
              <Card key={g.term.ru} className="p-5">
                <dt className="font-bold">{g.term[lang]}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{g.text[lang]}</dd>
              </Card>
            ))}
          </dl>
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-2xl font-extrabold"><Scale className="size-6 text-primary" />{t('reference.judging')}</h2>
          <p className="mt-2 max-w-3xl text-muted-foreground">{t('reference.judgingText')}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {JUDGING.map(j => (
              <Card key={j.title.ru} className="p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-lg font-bold">{j.title[lang]}</h3>
                  <span className="text-2xl font-extrabold tabular-nums text-primary">{j.share}</span>
                </div>
                {/* the share as a bar: 40% of the width = 40% of the score */}
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: j.share }} /></div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{j.text[lang]}</p>
              </Card>
            ))}
          </div>
          <Link to="/formats" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">{t('reference.otherFormats')}<ArrowRight className="size-4" /></Link>
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-2xl font-extrabold"><Lightbulb className="size-6 text-primary" />{t('reference.tips')}</h2>
          <ol className="mt-6 grid gap-3 md:grid-cols-2">
            {TIPS.map((tip, i) => (
              <li key={i} className="flex gap-3 rounded-2xl bg-primary-soft/60 p-4 text-sm leading-relaxed">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>{tip[lang]}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  )
}
