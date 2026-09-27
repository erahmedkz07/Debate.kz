import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, FileText, ShieldX } from 'lucide-react'
import { NotFoundError, verifyCertificate } from '@/api'
import { useAsync } from '@/lib/hooks'
import { formatDate, formatDateRange } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorState, Skeleton } from '@/components/ui/states'
import { useAward } from '@/components/certificate/CertificateSheet'

// public page behind the QR on a certificate: confirms it was issued by Debate.kz
export default function VerifyCertificate() {
  const { t } = useTranslation()
  const { code = '' } = useParams()
  const award = useAward()
  const { data, loading, error, reload } = useAsync(() => verifyCertificate(code), [code])

  return (
    <div className="container-page flex justify-center py-12">
      <Card className="w-full max-w-lg p-8 text-center">
        {loading ? <Skeleton className="h-64" /> : error instanceof NotFoundError || (error && !data) ? (
          error instanceof NotFoundError ? (
            <>
              <ShieldX className="mx-auto size-14 text-danger" />
              <h1 className="mt-4 text-2xl font-extrabold">{t('certificate.invalidTitle')}</h1>
              <p className="mt-2 text-muted-foreground">{t('certificate.invalidText', { code: code.toUpperCase() })}</p>
            </>
          ) : <ErrorState onRetry={reload} />
        ) : data && (
          <>
            <BadgeCheck className="mx-auto size-14 text-success" />
            <h1 className="mt-4 text-2xl font-extrabold">{t('certificate.validTitle')}</h1>
            <p className="mt-1 font-mono text-sm tracking-wider text-muted-foreground">{data.code}</p>
            <dl className="mt-6 space-y-3 text-left text-sm">
              <div><dt className="text-muted-foreground">{t('certificate.holder')}</dt><dd className="text-lg font-bold">{data.name}</dd></div>
              <div><dt className="text-muted-foreground">{t('certificate.award')}</dt><dd className="font-semibold">{award(data).lines.join(' · ')}</dd></div>
              <div>
                <dt className="text-muted-foreground">{t('certificate.tournament')}</dt>
                <dd><Link to={`/tournaments/${data.tournament.id}`} className="font-semibold text-primary hover:underline">{data.tournament.name}</Link> · {data.tournament.city} · {formatDateRange(data.tournament.startDate, data.tournament.endDate)}</dd>
              </div>
              <div><dt className="text-muted-foreground">{t('certificate.issued')}</dt><dd>{formatDate(data.issuedAt, { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>
            </dl>
            <Button asChild variant="outline" className="mt-6"><Link to={`/certificates/${data.code}`}><FileText className="size-4" />{t('certificate.open')}</Link></Button>
          </>
        )}
      </Card>
    </div>
  )
}
