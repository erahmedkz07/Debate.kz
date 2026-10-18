import { useTranslation } from 'react-i18next'
import type { Certificate } from '@/types'
import { formatDate, formatDateRange } from '@/lib/utils'
import { Medal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo, OrnamentPattern } from '@/components/brand'
import { QrCode } from './QrCode'

// The level of the award sets the sheet's colours: gold for a champion, the 1st place and the best speaker or
// judge, silver for the 2nd, bronze for the 3rd; every other certificate (participants, judges) keeps the brand blue
type Tier = 'gold' | 'silver' | 'bronze' | 'brand'
function tierOf(c: Certificate): Tier {
  if (c.kind === 'award') return 'gold'
  if (c.kind === 'judge') return 'brand'
  const place = Math.min(c.breakCategory ? c.categoryPlace ?? 99 : c.teamPlace ?? 99, c.speakerPlace ?? 99)
  return place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : 'brand'
}
const TIERS: Record<Tier, { frame: string; inner: string; title: string; seal: string }> = {
  gold: { frame: 'border-[#C9971C]', inner: 'border-[#E9C46A]', title: 'text-[#A87A0C]', seal: 'from-[#F6D776] to-[#C9971C] text-[#5C4100]' },
  silver: { frame: 'border-[#8C99A8]', inner: 'border-[#C7D0DA]', title: 'text-[#5D6B7A]', seal: 'from-[#E6EBF0] to-[#9AA6B4] text-[#2F3A46]' },
  bronze: { frame: 'border-[#A8643A]', inner: 'border-[#D9A27A]', title: 'text-[#8A4E2A]', seal: 'from-[#EBC09C] to-[#A8643A] text-[#4A2510]' },
  brand: { frame: 'border-primary', inner: 'border-accent', title: 'text-primary', seal: '' },
}
// the code in two easy-to-read halves: ABCDE-FGHJK
const grouped = (code: string) => code.replace(/^(.{5})(.+)$/, '$1-$2')

// the headline award of a certificate (used on the sheet and in lists)
export function useAward() {
  const { t } = useTranslation()
  return (c: Certificate) => {
    if (c.kind === 'judge') return { title: t('certificate.certificate'), lines: [t('certificate.judge')] }
    // best speaker / best judge of the tournament
    if (c.kind === 'award') return { title: t('certificate.diploma'), lines: [t(`certificate.awardTitle.${c.award}`), ...(c.teamName ? [t('certificate.ofTeam', { team: c.teamName })] : [])] }
    const team = c.teamName ?? ''
    const lines = [
      c.teamPlace && c.teamPlace <= 3 && !c.breakCategory ? t('certificate.teamPlace', { n: c.teamPlace, team })
        // a category bracket (novices…): its champion and finalist get it named
        : c.breakCategory && c.categoryPlace && c.categoryPlace <= 3 ? t('certificate.categoryPlace', { n: c.categoryPlace, team, category: c.breakCategory })
          : c.inBreak ? t('certificate.break', { team }) : t('certificate.participant', { team }),
      ...(c.speakerPlace ? [t('certificate.speakerPlace', { n: c.speakerPlace })] : []),
    ]
    const diploma = (!c.breakCategory && (c.teamPlace ?? 99) <= 3) || !!c.speakerPlace || (!!c.breakCategory && (c.categoryPlace ?? 99) <= 3)
    return { title: diploma ? t('certificate.diploma') : t('certificate.certificate'), lines }
  }
}

// One A4 landscape page. Printing (or "Save as PDF" in the print dialog) gives a real PDF with the site fonts.
export function CertificateSheet({ c }: { c: Certificate }) {
  const { t } = useTranslation()
  const award = useAward()(c)
  const verifyUrl = `${window.location.origin}/verify/${c.code}`
  const tier = TIERS[tierOf(c)]
  const place = tierOf(c) === 'gold' ? 1 : tierOf(c) === 'silver' ? 2 : tierOf(c) === 'bronze' ? 3 : 0
  return (
    <section className="cert-sheet relative mx-auto flex aspect-[297/210] w-full max-w-[1123px] flex-col overflow-hidden bg-white text-navy shadow-xl print:shadow-none">
      {/* brand frame */}
      <div className={cn('absolute inset-0 border-[14px]', tier.frame)} />
      <div className={cn('absolute inset-[22px] border-2', tier.inner)} />
      {/* the seal of a prize: gold, silver or bronze, with the place */}
      {place > 0 && (
        <div className={cn('absolute right-[6%] top-[8%] grid size-[clamp(64px,11vw,124px)] place-items-center rounded-full bg-gradient-to-br shadow-lg ring-4 ring-white', tier.seal)}>
          <div className="grid place-items-center text-center leading-none">
            <Medal className="size-[clamp(16px,2.6vw,30px)]" />
            <span className="mt-1 text-[clamp(1rem,2.4vw,1.9rem)] font-extrabold">{c.kind === 'award' ? '★' : place}</span>
          </div>
        </div>
      )}
      <OrnamentPattern className="text-primary/[0.05]" />
      <div className="relative flex flex-1 flex-col items-center px-[8%] pb-[5%] pt-[6%] text-center">
        <Logo />
        <p className={cn('mt-[3%] text-[clamp(1.5rem,4.2vw,3.25rem)] font-extrabold uppercase tracking-[0.2em]', tier.title)}>{award.title}</p>
        <p className="mt-1 text-[clamp(0.7rem,1.3vw,1rem)] uppercase tracking-[0.3em] text-navy/60">{t('certificate.awardedTo')}</p>
        <p className="mt-[2.5%] text-[clamp(1.4rem,3.6vw,2.75rem)] font-extrabold leading-tight">{c.name}</p>
        {c.institution && <p className="mt-1 text-[clamp(0.75rem,1.4vw,1.1rem)] text-navy/70">{c.institution}</p>}
        <div className="mt-[2.5%] space-y-1 text-[clamp(0.85rem,1.7vw,1.35rem)] font-semibold">
          {award.lines.map(line => <p key={line}>{line}</p>)}
        </div>
        <p className="mt-[2%] text-[clamp(0.8rem,1.5vw,1.15rem)] text-navy/80">
          «{c.tournament.name}» · {c.tournament.city} · {formatDateRange(c.tournament.startDate, c.tournament.endDate)}
        </p>
        <div className="mt-auto flex w-full items-end justify-between gap-4 text-left">
          <div className="text-[clamp(0.6rem,1.1vw,0.85rem)] text-navy/70">
            <p>{t('certificate.organizer')}: <b className="text-navy">{c.tournament.organizer}</b></p>
            <p>{t('certificate.issued')}: {formatDate(c.issuedAt, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="flex items-end gap-3 text-right">
            <div className="text-[clamp(0.55rem,1vw,0.8rem)] text-navy/70">
              <p className="uppercase tracking-[0.15em]">{t('certificate.number')}</p>
              <p className="font-mono text-[clamp(0.8rem,1.6vw,1.25rem)] font-extrabold tracking-[0.12em] text-navy">№ {grouped(c.code)}</p>
              <p className="mt-0.5">{t('certificate.verify')} {window.location.host}/verify</p>
            </div>
            <QrCode value={verifyUrl} size={96} className="size-[clamp(56px,9vw,104px)]" />
          </div>
        </div>
      </div>
    </section>
  )
}
