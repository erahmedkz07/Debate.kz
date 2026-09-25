import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Printer } from 'lucide-react'
import { getTournamentCertificates, verifyCertificate } from '@/api'
import type { Certificate } from '@/types'
import { useAsync } from '@/lib/hooks'
import { Button } from '@/components/ui/button'
import { ErrorState, Skeleton } from '@/components/ui/states'
import { CertificateSheet } from '@/components/certificate/CertificateSheet'

// /certificates/:code — one certificate; /tournaments/:id/certificates/print — every certificate of a tournament.
// "Download PDF" opens the print dialog: choosing "Save as PDF" gives an A4 landscape PDF with the site fonts.
export default function CertificatePrint() {
  const { t } = useTranslation()
  const { code, id } = useParams()
  const { data, loading, error, reload } = useAsync<Certificate[]>(
    () => (code ? verifyCertificate(code).then(c => [c]) : getTournamentCertificates(id!)), [code, id])

  return (
    <div className="min-h-dvh bg-muted/40 print:bg-white">
      <div className="print-hidden sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1123px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to={code ? '/me' : `/dashboard/tournaments/${id}/results`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary">
            <ArrowLeft className="size-4" />{t('certificate.back')}
          </Link>
          <div className="flex items-center gap-3">
            <p className="hidden text-xs text-muted-foreground sm:block">{t('certificate.printHint')}</p>
            <Button onClick={() => window.print()} disabled={!data?.length}><Printer className="size-4" />{t('certificate.download')}</Button>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1123px] space-y-8 px-4 py-8 print:space-y-0 print:p-0">
        {error ? <ErrorState onRetry={reload} /> : loading || !data ? <Skeleton className="aspect-[297/210]" /> : data.length === 0
          ? <p className="text-center text-muted-foreground">{t('certificate.none')}</p>
          : data.map(c => <CertificateSheet key={c.code} c={c} />)}
      </div>
    </div>
  )
}
