import { useTranslation } from 'react-i18next'
import { HandHeart, Languages, Scale, Users } from 'lucide-react'
import { images } from '@/mocks/images'
import { Button } from '@/components/ui/button'
import { Ornament, OrnamentPattern, TelegramIcon } from '@/components/brand'
import { Reveal } from '@/components/motion'

export default function About() {
  const { t } = useTranslation()
  const values = [
    { k: 'v1', icon: HandHeart }, { k: 'v2', icon: Scale }, { k: 'v3', icon: Languages }, { k: 'v4', icon: Users },
  ]
  return (
    <>
      <section className="relative -mt-16 overflow-hidden pt-16 text-white lg:-mt-18 lg:pt-18">
        <img src={images.audience} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/85 to-navy/40" />
        <div className="container-page relative py-20 sm:py-28">
          <Ornament className="mb-6 w-16 text-accent" />
          <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{t('about.title')}</h1>
          <p className="mt-5 max-w-2xl text-lg text-white/80">{t('about.subtitle')}</p>
        </div>
      </section>

      <section className="container-page grid items-center gap-12 py-20 lg:grid-cols-2">
        <Reveal>
          <p className="text-sm font-bold uppercase tracking-wider text-primary">{t('about.missionTitle')}</p>
          <p className="mt-4 text-2xl font-bold leading-relaxed sm:text-3xl">{t('about.mission')}</p>
        </Reveal>
        <Reveal delay={0.1} className="grid grid-cols-2 gap-4">
          <img src={images.studentsLaptop} alt="" loading="lazy" className="aspect-[3/4] w-full rounded-3xl object-cover shadow-lg" />
          <img src={images.handsUp2} alt="" loading="lazy" className="mt-10 aspect-[3/4] w-full rounded-3xl object-cover shadow-lg" />
        </Reveal>
      </section>

      <section className="bg-muted/50 py-20">
        <div className="container-page">
          <h2 className="text-center text-3xl font-extrabold sm:text-4xl">{t('about.valuesTitle')}</h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {values.map(({ k, icon: Icon }, i) => (
              <Reveal key={k} delay={i * 0.08} className="rounded-2xl border border-border bg-card p-6 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary"><Icon className="size-7" /></span>
                <h3 className="mt-4 text-lg font-bold">{t(`about.${k}`)}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t(`about.${k}d`)}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page grid gap-12 py-20 lg:grid-cols-2">
        <Reveal>
          <h2 className="text-3xl font-extrabold">{t('about.storyTitle')}</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{t('about.story')}</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="text-3xl font-extrabold">{t('about.teamTitle')}</h2>
          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary">
              <Ornament className="w-10 text-accent" />
            </span>
            <div>
              <p className="text-lg font-bold">Ермек Ахмед</p>
              <p className="text-sm text-muted-foreground">{t('about.founder')}</p>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="container-page pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 text-center text-white sm:px-12">
          <OrnamentPattern className="text-white/[0.07]" />
          <h2 className="relative text-2xl font-extrabold sm:text-3xl">{t('about.contactTitle')}</h2>
          <Button asChild variant="accent" size="lg" className="relative mt-7">
            <a href="https://t.me/" target="_blank" rel="noreferrer"><TelegramIcon className="size-5" />{t('about.contactCta')}</a>
          </Button>
        </div>
      </section>
    </>
  )
}
