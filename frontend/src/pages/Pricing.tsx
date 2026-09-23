import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, Info, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Accordion } from '@/components/ui/accordion'
import { Ornament } from '@/components/brand'
import { Reveal } from '@/components/motion'

const base = ['draw', 'ballots', 'results', 'langs', 'telegram'] as const
const pro = ['unlimited', 'support', 'branding'] as const

export default function Pricing() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('pricing.title')} subtitle={t('pricing.subtitle')} />
      <div className="container-page py-14">
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
          <Reveal className="flex flex-col rounded-3xl border-2 border-border bg-card p-8">
            <p className="text-sm font-bold uppercase tracking-wider text-primary">{t('pricing.free')}</p>
            <p className="mt-4 text-5xl font-extrabold">{t('pricing.freePrice')}</p>
            <p className="mt-2 text-muted-foreground">{t('pricing.freeFor')}</p>
            <ul className="mt-8 flex-1 space-y-3">
              {base.map(f => <li key={f} className="flex items-start gap-3 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-success" />{t(`pricing.features.${f}`)}</li>)}
            </ul>
            <Button asChild variant="outline" size="lg" className="mt-8"><Link to="/register">{t('pricing.freeCta')}</Link></Button>
          </Reveal>
          <Reveal delay={0.1} className="relative flex flex-col overflow-hidden rounded-3xl bg-navy p-8 text-white shadow-2xl shadow-primary/20">
            <Ornament className="absolute -right-10 -top-6 w-52 text-white/5" />
            <span className="absolute right-6 top-6 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-bold text-navy"><Sparkles className="size-3.5" />{t('pricing.popular')}</span>
            <p className="text-sm font-bold uppercase tracking-wider text-accent">{t('pricing.pro')}</p>
            <p className="mt-4 text-4xl font-extrabold">{t('pricing.proPrice')}</p>
            <p className="mt-2 text-white/70">{t('pricing.proFor')}</p>
            <ul className="mt-8 flex-1 space-y-3">
              {[...base, ...pro].map(f => <li key={f} className="flex items-start gap-3 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-accent" />{t(`pricing.features.${f}`)}</li>)}
            </ul>
            <Button asChild variant="accent" size="lg" className="mt-8"><a href="https://t.me/" target="_blank" rel="noreferrer">{t('pricing.proCta')}</a></Button>
          </Reveal>
        </div>
        <p className="mx-auto mt-8 flex max-w-4xl items-start gap-3 rounded-2xl bg-primary-soft p-4 text-sm text-foreground">
          <Info className="mt-0.5 size-5 shrink-0 text-primary" />{t('pricing.paymentNote')}
        </p>

        <section id="faq" className="mx-auto mt-20 max-w-3xl scroll-mt-24">
          <h2 className="mb-8 text-center text-3xl font-extrabold">{t('pricing.faqTitle')}</h2>
          <Accordion items={[1, 2, 3, 4, 5].map(n => ({ q: t(`pricing.faq.q${n}`), a: t(`pricing.faq.a${n}`) }))} />
        </section>
      </div>
    </>
  )
}
