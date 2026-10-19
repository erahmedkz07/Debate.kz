import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Printer } from 'lucide-react'
import { getSpeakerLinks } from '@/api'
import { useAsync } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ErrorState, Skeleton } from '@/components/ui/states'
import { QrCode } from '@/components/certificate/QrCode'
import { Logo } from '@/components/brand'
import { useBack } from '@/components/layout/BackButton'

// Personal QR cards of every speaker, to print and hand out at the registration desk (cut along the lines): the
// speaker scans, sees their draw, results and certificate, and saves them to their profile.
export default function SpeakerLinksPrint() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const back = useBack(`/dashboard/tournaments/${id}/teams`)
  const { data, loading, error, reload } = useAsync(() => getSpeakerLinks(id), [id])
  const leagues = [...new Set((data ?? []).map(x => x.league).filter(Boolean))] as string[]
  const [league, setLeague] = useState('')
  const teams = (data ?? []).filter(x => !league || x.league === league)
  const url = (key: string) => `${window.location.origin}/s/${key}`
  return (
    <div className="min-h-dvh bg-muted/40 print:bg-white">
      <style>{'@page { size: A4; margin: 10mm; } @media print { html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }'}</style>
      <div className="print-hidden sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <button type="button" onClick={back} className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />{t('common.back')}</button>
          <div className="flex flex-wrap items-center gap-2">
            {leagues.length > 1 && ['', ...leagues].map(l => (
              <button key={l || 'all'} type="button" onClick={() => setLeague(l)} aria-pressed={league === l}
                className={cn('cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold', league === l ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>
                {l || t('common.all')}
              </button>
            ))}
            <Button onClick={() => window.print()} disabled={!teams.length}><Printer className="size-4" />{t('speakerLink.print')}</Button>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[210mm] p-4 print:p-0">
        <p className="print-hidden mb-4 text-sm text-muted-foreground">{t('speakerLink.printHint')}</p>
        {error ? <ErrorState onRetry={reload} /> : loading || !data ? <Skeleton className="h-96" /> : (
          <div className="grid grid-cols-2 gap-0 bg-white sm:grid-cols-3 print:grid-cols-3">
            {teams.flatMap(tm => tm.speakers.map(s => (
              <div key={s.id} className="flex break-inside-avoid flex-col items-center border border-dashed border-slate-300 p-3 text-center text-slate-900">
                <Logo className="pointer-events-none scale-75" />
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{tm.league ?? ''}</p>
                <p className="text-sm font-extrabold leading-tight">{s.name}</p>
                <p className="text-xs text-slate-600">{tm.teamName}</p>
                <QrCode value={url(s.accessKey)} size={120} className="mt-2" />
                <p className="mt-1 text-[10px] leading-snug text-slate-600">{t('speakerLink.cardText')}</p>
                {s.linked && <p className="mt-1 text-[10px] font-bold text-emerald-700">{t('speakerLink.cardLinked')}</p>}
              </div>
            )))}
          </div>
        )}
      </div>
    </div>
  )
}
