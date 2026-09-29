import { useTranslation } from 'react-i18next'
import type { Certificate } from '@/types'
import { formatDate, formatDateRange } from '@/lib/utils'
import { Logo, OrnamentPattern } from '@/components/brand'
import { QrCode } from './QrCode'

// the headline award of a certificate (used on the sheet and in lists)
export function useAward() {
  const { t } = useTranslation()
  return (c: Certificate) => {
    if (c.kind === 'judge') return { title: t('certificate.certificate'), lines: [t('certificate.judge')] }
    const team = c.teamName ?? ''
    const lines = [
      c.teamPlace && c.teamPlace <= 3 && !c.breakCategory ? t('certificate.teamPlace', { n: c.teamPlace, team })
        // a category bracket (novices…): its champion and finalist get it named
        : c.breakCategory && c.categoryPlace && c.categoryPlace <= 2 ? t('certificate.categoryPlace', { n: c.categoryPlace, team, category: c.breakCategory })
          : c.inBreak ? t('certificate.break', { team }) : t('certificate.participant', { team }),
      ...(c.speakerPlace ? [t('certificate.speakerPlace', { n: c.speakerPlace })] : []),
    ]
    const diploma = (c.teamPlace ?? 99) <= 3 || !!c.speakerPlace || (!!c.breakCategory && (c.categoryPlace ?? 99) <= 2)
    return { title: diploma ? t('certificate.diploma') : t('certificate.certificate'), lines }
  }
}

// One A4 landscape page. Printing (or "Save as PDF" in the print dialog) gives a real PDF with the site fonts.
export function CertificateSheet({ c }: { c: Certificate }) {
  const { t } = useTranslation()
  const award = useAward()(c)
  const verifyUrl = `${window.location.origin}/verify/${c.code}`
  return (
    <section className="cert-sheet relative mx-auto flex aspect-[297/210] w-full max-w-[1123px] flex-col overflow-hidden bg-white text-navy shadow-xl print:shadow-none">
      {/* brand frame */}
      <div className="absolute inset-0 border-[14px] border-primary" />
      <div className="absolute inset-[22px] border-2 border-accent" />
      <OrnamentPattern className="text-primary/[0.05]" />
      <div className="relative flex flex-1 flex-col items-center px-[8%] pb-[5%] pt-[6%] text-center">
        <Logo />
        <p className="mt-[3%] text-[clamp(1.5rem,4.2vw,3.25rem)] font-extrabold uppercase tracking-[0.2em] text-primary">{award.title}</p>
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
              <p>{t('certificate.verify')}</p>
              <p className="font-mono font-bold tracking-wider text-navy">{c.code}</p>
              <p>{window.location.host}/verify</p>
            </div>
            <QrCode value={verifyUrl} size={96} className="size-[clamp(56px,9vw,104px)]" />
          </div>
        </div>
      </div>
    </section>
  )
}
