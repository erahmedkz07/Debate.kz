import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, Clock, FileText, HelpCircle, Mail, QrCode, Receipt, RotateCcw, ScanLine, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { getPlans } from '@/api'
import { useAsync } from '@/lib/hooks'
import { formatNumber } from '@/lib/utils'
import { FREE_TEAM_LIMIT } from '@/lib/plans'
import { PageHeader } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Accordion } from '@/components/ui/accordion'
import { Ornament } from '@/components/brand'
import { Reveal } from '@/components/motion'

// every plan has every feature; the only difference is the tournament size
const features = ['draw', 'ballots', 'results', 'certificates', 'checkin', 'projector', 'langs', 'telegram', 'support'] as const
const steps = [ScanLine, Receipt, Send, ShieldCheck]
const info = [
  { key: 'what', icon: FileText },
  { key: 'when', icon: Clock },
  { key: 'refund', icon: RotateCcw },
  { key: 'receipt', icon: Receipt },
  { key: 'orgs', icon: HelpCircle },
  { key: 'contact', icon: Mail },
] as const

export default function Pricing() {
  const { t } = useTranslation()
  const { data } = useAsync(getPlans)
  const limit = data?.freeTeamLimit ?? FREE_TEAM_LIMIT
  const price = data ? `${formatNumber(data.proPrice)} ₸` : '…'
  return (
    <>
      <PageHeader title={t('pricing.title')} subtitle={t('pricing.subtitle', { limit })} />
      <div className="container-page py-14">
        <div className="mx-auto grid grid-cols-1 max-w-4xl gap-6 md:grid-cols-2">
          <Reveal className="flex flex-col rounded-3xl border-2 border-border bg-card p-8">
            <p className="text-sm font-bold uppercase tracking-wider text-primary">{t('pricing.free')}</p>
            <p className="mt-4 text-5xl font-extrabold">0 ₸</p>
            <p className="mt-2 text-muted-foreground">{t('pricing.freeFor', { limit })}</p>
            <ul className="mt-8 flex-1 space-y-3">
              {features.map(f => <li key={f} className="flex items-start gap-3 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-success" />{t(`pricing.features.${f}`)}</li>)}
            </ul>
            <Button asChild variant="outline" size="lg" className="mt-8"><Link to="/dashboard/tournaments/new">{t('pricing.freeCta')}</Link></Button>
          </Reveal>
          <Reveal delay={0.1} className="relative flex flex-col overflow-hidden rounded-3xl bg-navy p-8 text-white shadow-2xl shadow-primary/20">
            <Ornament className="absolute -right-10 -top-6 w-52 text-white/5" />
            <span className="absolute right-6 top-6 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-bold text-navy"><Sparkles className="size-3.5" />{t('pricing.bigEvents')}</span>
            <p className="text-sm font-bold uppercase tracking-wider text-accent">{t('pricing.pro')}</p>
            <p className="mt-4 text-5xl font-extrabold tabular-nums">{price}</p>
            <p className="mt-2 text-white/70">{t('pricing.proFor', { limit })}</p>
            <ul className="mt-8 flex-1 space-y-3">
              <li className="flex items-start gap-3 text-sm font-semibold"><Check className="mt-0.5 size-4 shrink-0 text-accent" />{t('pricing.sameFeatures')}</li>
              <li className="flex items-start gap-3 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-accent" />{t('pricing.upTo128')}</li>
              <li className="flex items-start gap-3 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-accent" />{t('pricing.oncePerTournament')}</li>
              <li className="flex items-start gap-3 text-sm"><QrCode className="mt-0.5 size-4 shrink-0 text-accent" />{t('pricing.kaspi')}</li>
            </ul>
            <Button asChild variant="accent" size="lg" className="mt-8"><Link to="/dashboard/tournaments/new">{t('pricing.proCta')}</Link></Button>
          </Reveal>
        </div>

        {/* how a Pro payment works */}
        <section className="mx-auto mt-16 max-w-4xl">
          <h2 className="text-center text-2xl font-extrabold sm:text-3xl">{t('pricing.howTitle')}</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-muted-foreground">{t('pricing.howText')}</p>
          <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((Icon, i) => (
              <li key={i}>
                <Card className="h-full p-5">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-5" /></span>
                  <p className="mt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('pricing.step', { n: i + 1 })}</p>
                  <p className="mt-1 text-sm font-semibold">{t(`pricing.steps.s${i + 1}`)}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        {/* reference information */}
        <section className="mx-auto mt-16 max-w-4xl">
          <h2 className="text-center text-2xl font-extrabold sm:text-3xl">{t('pricing.infoTitle')}</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {info.map(({ key, icon: Icon }) => (
              <Card key={key} className="flex gap-4 p-5">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <h3 className="font-bold">{t(`pricing.info.${key}.title`)}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t(`pricing.info.${key}.text`, { limit, price })}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section id="faq" className="mx-auto mt-20 max-w-3xl scroll-mt-24">
          <h2 className="mb-8 text-center text-3xl font-extrabold">{t('pricing.faqTitle')}</h2>
          <Accordion items={[1, 2, 3, 4, 5, 6].map(n => ({ q: t(`pricing.faq.q${n}`, { limit }), a: t(`pricing.faq.a${n}`, { limit, price }) }))} />
        </section>
      </div>
    </>
  )
}
