import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { animate, motion, useInView } from 'framer-motion'
import {
  ArrowRight, Bell, CheckCircle2, ClipboardCheck, Gavel, Languages, Plus, Quote, Radio, Shuffle, Sparkles, Trophy, UserPlus, Users,
} from 'lucide-react'
import { getPlatformStats, getTestimonials, getUpcomingTournaments } from '@/api'
import { images } from '@/mocks/images'
import { useAsync } from '@/lib/hooks'
import { formatNumber, initials } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ErrorState, Skeleton } from '@/components/ui/states'
import { Ornament, OrnamentPattern } from '@/components/brand'
import { Reveal } from '@/components/motion'
import { TournamentCard, TournamentCardSkeleton } from '@/components/tournament/TournamentCard'

function SectionTitle({ title, subtitle, center = true }: { title: string; subtitle?: string; center?: boolean }) {
  return (
    <Reveal className={center ? 'mx-auto max-w-2xl text-center' : ''}>
      <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-3 text-base text-muted-foreground sm:text-lg">{subtitle}</p>}
    </Reveal>
  )
}

function Hero() {
  const { t } = useTranslation()
  return (
    <section className="relative -mt-16 overflow-hidden pt-16 lg:-mt-18 lg:pt-18">
      {/* animated background shapes */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft via-background to-accent-soft/60" />
      <div className="pointer-events-none absolute -left-32 top-20 size-96 animate-float-slow rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 size-80 animate-float-slow rounded-full bg-accent/30 blur-3xl [animation-delay:-3s]" />
      <Ornament className="pointer-events-none absolute -left-10 bottom-10 hidden w-40 rotate-12 text-primary/10 lg:block" />

      <div className="container-page relative grid items-center gap-12 py-14 lg:grid-cols-[1.05fr_1fr] lg:py-24">
        <div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/80 px-3.5 py-1.5 text-xs font-bold text-primary shadow-sm backdrop-blur sm:text-sm">
            <Sparkles className="size-4 text-accent-foreground dark:text-accent" />{t('home.hero.badge')}
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            {t('home.hero.title1')}{' '}
            <span className="relative inline-block text-primary">
              {t('home.hero.title2')}
              <svg className="absolute -bottom-2 left-0 w-full text-accent" viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden>
                <motion.path d="M2 9 C 80 2, 200 2, 298 7" stroke="currentColor" strokeWidth="6" strokeLinecap="round" fill="none"
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, delay: 0.7 }} />
              </svg>
            </span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {t('home.hero.subtitle')}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg"><Link to="/dashboard/tournaments/new"><Plus className="size-5" />{t('home.hero.create')}</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/tournaments">{t('home.hero.browse')}<ArrowRight className="size-5" /></Link></Button>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.2 }} className="relative mx-auto w-full max-w-lg lg:max-w-none">
          <div className="absolute -inset-3 rotate-3 rounded-[2rem] bg-gradient-to-br from-primary to-accent opacity-90" />
          <div className="relative overflow-hidden rounded-[1.75rem] shadow-2xl">
            <img src={images.heroSpeaker} alt="" className="aspect-[4/3.6] w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/40 to-transparent" />
          </div>

          {/* floating live cards */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 }}
            className="absolute -left-4 top-8 max-w-[15rem] rounded-2xl border border-border bg-card/95 p-3.5 shadow-xl backdrop-blur sm:-left-10">
            <div className="flex items-center gap-2 text-xs font-bold text-danger"><Radio className="size-3.5 animate-pulse" />{t('home.hero.liveRound')}</div>
            <p className="mt-1.5 text-sm font-semibold leading-snug">{t('home.hero.liveMotion')}</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1 }}
            className="absolute -bottom-5 -right-2 flex items-center gap-3 rounded-2xl border border-border bg-card/95 p-3.5 shadow-xl backdrop-blur sm:-right-6">
            <span className="grid size-10 place-items-center rounded-xl bg-success-soft text-success"><ClipboardCheck className="size-5" /></span>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">{t('home.hero.ballots')}</p>
              <p className="text-sm font-bold">{t('home.hero.ballotsDone')}</p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

function Counter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!inView) return
    const c = animate(0, value, { duration: 1.6, ease: 'easeOut', onUpdate: v => setN(Math.round(v)) })
    return () => c.stop()
  }, [inView, value])
  return <span ref={ref}>{formatNumber(n)}</span>
}

function Stats() {
  const { t } = useTranslation()
  const { data } = useAsync(getPlatformStats)
  const items = ['tournaments', 'teams', 'debaters', 'cities'] as const
  return (
    <section className="container-page relative z-10 mt-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-lg lg:grid-cols-4">
        {items.map(key => (
          <div key={key} className="bg-card px-5 py-6 text-center sm:py-8">
            <div className="text-3xl font-extrabold text-primary sm:text-4xl">
              {data ? <><Counter value={data[key]} />+</> : <Skeleton className="mx-auto h-9 w-20" />}
            </div>
            <p className="mt-1 text-sm font-medium text-muted-foreground">{t(`home.stats.${key}`)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function HowItWorks() {
  const { t } = useTranslation()
  const steps = [
    { icon: Plus, n: 1 }, { icon: UserPlus, n: 2 }, { icon: Shuffle, n: 3 }, { icon: Trophy, n: 4 },
  ]
  return (
    <section className="container-page py-20 sm:py-28">
      <SectionTitle title={t('home.how.title')} subtitle={t('home.how.subtitle')} />
      <div className="relative mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="absolute left-[12%] right-[12%] top-10 hidden h-0.5 border-t-2 border-dashed border-primary/30 lg:block" />
        {steps.map(({ icon: Icon, n }, i) => (
          <Reveal key={n} delay={i * 0.1} className="relative text-center">
            <div className="relative mx-auto grid size-20 place-items-center rounded-3xl bg-card shadow-lg ring-1 ring-border">
              <Icon className="size-8 text-primary" />
              <span className="absolute -right-2 -top-2 grid size-8 place-items-center rounded-full bg-accent text-sm font-extrabold text-accent-foreground shadow">{n}</span>
            </div>
            <h3 className="mt-5 text-lg font-bold">{t(`home.how.s${n}`)}</h3>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{t(`home.how.s${n}d`)}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function Upcoming() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => getUpcomingTournaments(3))
  return (
    <section className="bg-muted/50 py-20 sm:py-28">
      <div className="container-page">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <SectionTitle center={false} title={t('home.upcoming.title')} subtitle={t('home.upcoming.subtitle')} />
          <Button asChild variant="outline" className="shrink-0"><Link to="/tournaments">{t('common.viewAll')}<ArrowRight className="size-4" /></Link></Button>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {error ? <div className="sm:col-span-2 lg:col-span-3"><ErrorState onRetry={reload} /></div>
            : loading || !data ? Array.from({ length: 3 }, (_, i) => <TournamentCardSkeleton key={i} />)
              : data.map((item, i) => <Reveal key={item.id} delay={i * 0.1}><TournamentCard t={item} /></Reveal>)}
        </div>
      </div>
    </section>
  )
}

function Features() {
  const { t } = useTranslation()
  const items = [
    { k: 'draw', icon: Shuffle, color: 'bg-primary-soft text-primary' },
    { k: 'judges', icon: Gavel, color: 'bg-accent-soft text-navy dark:text-accent' },
    { k: 'ballots', icon: ClipboardCheck, color: 'bg-success-soft text-success' },
    { k: 'live', icon: Radio, color: 'bg-danger-soft text-danger' },
    { k: 'telegram', icon: Bell, color: 'bg-primary-soft text-primary' },
    { k: 'lang', icon: Languages, color: 'bg-accent-soft text-navy dark:text-accent' },
  ]
  return (
    <section className="container-page py-20 sm:py-28">
      <SectionTitle title={t('home.features.title')} subtitle={t('home.features.subtitle')} />
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ k, icon: Icon, color }, i) => (
          <Reveal key={k} delay={(i % 3) * 0.08}
            className="group rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5">
            <div className={`grid size-12 place-items-center rounded-2xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-6deg] ${color}`}>
              <Icon className="size-6" />
            </div>
            <h3 className="mt-5 text-lg font-bold">{t(`home.features.${k}`)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`home.features.${k}D`)}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function Audience() {
  const { t } = useTranslation()
  const blocks = [
    { k: 'org', img: images.teamTable, to: '/dashboard/tournaments/new', variant: 'primary' as const },
    { k: 'part', img: images.studentsHall, to: '/tournaments', variant: 'accent' as const },
  ]
  return (
    <section className="bg-muted/50 py-20 sm:py-28">
      <div className="container-page">
        <SectionTitle title={t('home.audience.title')} />
        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {blocks.map(({ k, img, to, variant }, i) => (
            <Reveal key={k} delay={i * 0.1} className="group overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
              <div className="relative h-56 overflow-hidden sm:h-64">
                <img src={img} alt="" loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-navy/80 via-navy/20 to-transparent" />
                <h3 className="absolute bottom-5 left-6 text-2xl font-extrabold text-white sm:text-3xl">{t(`home.audience.${k}Title`)}</h3>
              </div>
              <div className="p-6 sm:p-8">
                <p className="text-muted-foreground">{t(`home.audience.${k}Text`)}</p>
                <ul className="mt-5 space-y-3">
                  {[1, 2, 3].map(n => (
                    <li key={n} className="flex items-start gap-3 text-sm font-medium">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />{t(`home.audience.${k}${n}`)}
                    </li>
                  ))}
                </ul>
                <Button asChild variant={variant} className="mt-7"><Link to={to}>{t(`home.audience.${k}Cta`)}<ArrowRight className="size-4" /></Link></Button>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function PricingTeaser() {
  const { t } = useTranslation()
  return (
    <section className="container-page py-20 sm:py-28">
      <SectionTitle title={t('home.pricing.title')} subtitle={t('home.pricing.subtitle')} />
      <div className="mx-auto mt-12 grid max-w-4xl gap-5 sm:grid-cols-2">
        <Reveal className="rounded-3xl border-2 border-primary bg-card p-8 shadow-lg shadow-primary/10">
          <p className="text-sm font-bold uppercase tracking-wider text-primary">{t('home.pricing.freeTitle')}</p>
          <p className="mt-3 text-5xl font-extrabold">0 ₸</p>
          <p className="mt-4 text-muted-foreground">{t('home.pricing.freeText')}</p>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-sm font-bold text-primary"><Users className="size-4" />≤ 12</p>
        </Reveal>
        <Reveal delay={0.1} className="relative overflow-hidden rounded-3xl bg-navy p-8 text-white shadow-lg">
          <Ornament className="absolute -right-8 -top-6 w-44 text-white/5" />
          <p className="text-sm font-bold uppercase tracking-wider text-accent">{t('home.pricing.proTitle')}</p>
          <p className="mt-3 text-5xl font-extrabold">13+</p>
          <p className="mt-4 text-white/70">{t('home.pricing.proText')}</p>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-sm font-bold text-navy"><Trophy className="size-4" />Pro</p>
        </Reveal>
      </div>
      <div className="mt-8 text-center">
        <Button asChild variant="link"><Link to="/pricing">{t('home.pricing.cta')}<ArrowRight className="size-4" /></Link></Button>
      </div>
    </section>
  )
}

function Testimonials() {
  const { t } = useTranslation()
  const { data } = useAsync(getTestimonials)
  const colors = ['bg-primary text-white', 'bg-accent text-navy', 'bg-navy text-white dark:bg-primary-soft dark:text-primary']
  return (
    <section className="bg-muted/50 py-20 sm:py-28">
      <div className="container-page">
        <SectionTitle title={t('home.testimonials.title')} />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {(data ?? Array.from({ length: 3 }, () => null)).map((item, i) => item ? (
            <Reveal key={item.name} delay={i * 0.1} className="relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
              <Quote className="size-8 text-accent" fill="currentColor" />
              <p className="mt-4 flex-1 leading-relaxed">{item.text}</p>
              <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
                <span className={`grid size-11 place-items-center rounded-full text-sm font-bold ${colors[i % 3]}`}>{initials(item.name)}</span>
                <div>
                  <p className="font-bold">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.role}</p>
                </div>
              </div>
            </Reveal>
          ) : <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  const { t } = useTranslation()
  return (
    <section className="container-page py-20 sm:py-28">
      <Reveal className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary via-[#0088b5] to-navy px-6 py-16 text-center text-white shadow-2xl shadow-primary/20 sm:px-12 sm:py-20">
        <OrnamentPattern className="text-white/[0.06]" />
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-accent/40 blur-3xl" />
        <div className="relative">
          <Ornament className="mx-auto mb-6 w-20 text-accent" />
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{t('home.cta.title')}</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">{t('home.cta.subtitle')}</p>
          <Button asChild size="lg" variant="accent" className="mt-9"><Link to="/register">{t('home.cta.button')}<ArrowRight className="size-5" /></Link></Button>
        </div>
      </Reveal>
    </section>
  )
}

export default function Home() {
  return (
    <>
      <Hero />
      <Stats />
      <HowItWorks />
      <Upcoming />
      <Features />
      <Audience />
      <PricingTeaser />
      <Testimonials />
      <FinalCta />
    </>
  )
}
