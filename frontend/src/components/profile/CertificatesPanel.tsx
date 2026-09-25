import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Award, BadgeCheck, FileText } from 'lucide-react'
import { getMyCertificates } from '@/api'
import { useAsync } from '@/lib/hooks'
import { formatDateRange } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import { useAward } from '@/components/certificate/CertificateSheet'

// certificates of finished tournaments where the person spoke or judged
export function CertificatesPanel() {
  const { t } = useTranslation()
  const award = useAward()
  const { data, loading, error, reload } = useAsync(getMyCertificates)
  if (error) return <ErrorState onRetry={reload} />
  if (loading || !data) return <Skeleton className="h-48" />
  if (!data.length) return <EmptyState icon={<Award className="size-7" />} title={t('certificate.emptyTitle')} text={t('certificate.emptyText')} />
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.map(c => {
        const a = award(c)
        return (
          <Card key={c.code} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Badge variant={a.title === t('certificate.diploma') ? 'accent' : 'primary'}><Award className="size-3" />{a.title}</Badge>
                <p className="mt-2 font-bold leading-snug">{c.tournament.name}</p>
                <p className="text-xs text-muted-foreground">{c.tournament.city} · {formatDateRange(c.tournament.startDate, c.tournament.endDate)}</p>
              </div>
            </div>
            <ul className="mt-3 space-y-0.5 text-sm">{a.lines.map(line => <li key={line}>{line}</li>)}</ul>
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              <Button asChild size="sm"><Link to={`/certificates/${c.code}`}><FileText className="size-4" />{t('certificate.open')}</Link></Button>
              <Button asChild size="sm" variant="ghost"><Link to={`/verify/${c.code}`}><BadgeCheck className="size-4" />{t('certificate.check')}</Link></Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
