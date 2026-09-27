import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { EyeOff, ShieldCheck } from 'lucide-react'
import { getSafetyReports, updateSafetyReport } from '@/api'
import type { SafetyReport, SafetyStatus } from '@/types'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/utils'
import { Forbidden } from '@/components/auth/guards'
import { CabinetHeader } from '@/pages/dashboard/DashboardLayout'
import { safetyStatusVariant } from '@/pages/Safety'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'

const STATUSES: SafetyStatus[] = ['open', 'in_progress', 'resolved']

// Queue of behaviour reports for admins and safeguarding officers
export default function SafetyReports() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const allowed = user?.role === 'admin' || !!user?.safeguardingOfficer
  const { data, loading, error, reload } = useAsync(() => (allowed ? getSafetyReports() : Promise.resolve([])), [allowed])
  const [filter, setFilter] = useState<SafetyStatus | 'active'>('active')
  if (!allowed) return <Forbidden />

  const shown = (data ?? []).filter(r => (filter === 'active' ? r.status !== 'resolved' : r.status === filter))
  return (
    <div className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6">
      <CabinetHeader title={t('safety.queueTitle')} subtitle={t('safety.queueSubtitle')}
        action={<Select className="w-52" value={filter} onValueChange={v => setFilter(v as typeof filter)} aria-label={t('safety.statusLabel')}
          options={[{ value: 'active', label: t('safety.active') }, ...STATUSES.map(s => ({ value: s, label: t(`safety.status.${s}`) }))]} />} />
      <p className="mt-4 flex items-start gap-2 rounded-2xl bg-primary-soft/60 p-4 text-sm"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />{t('safety.queueHint')}</p>
      <div className="mt-6">
        {error ? <ErrorState onRetry={reload} /> : loading && !data ? <Skeleton className="h-96" /> : shown.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="size-7" />} title={t('safety.queueEmpty')} />
        ) : (
          <div className="space-y-4">{shown.map(r => <ReportCard key={r.id} report={r} onChanged={reload} />)}</div>
        )}
      </div>
    </div>
  )
}

function ReportCard({ report: r, onChanged }: { report: SafetyReport; onChanged: () => void }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState(r.status)
  const [note, setNote] = useState(r.resolutionNote ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setStatus(r.status); setNote(r.resolutionNote ?? '') }, [r])
  const dirty = status !== r.status || note.trim() !== (r.resolutionNote ?? '')

  const save = async () => {
    setBusy(true)
    try {
      await updateSafetyReport(r.id, { status, resolutionNote: note.trim() || undefined })
      toast.success(t('safety.saved'))
      onChanged()
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={safetyStatusVariant[r.status]}>{t(`safety.status.${r.status}`)}</Badge>
          <span className="font-bold">{t(`safety.categories.${r.category}`)}</span>
        </div>
        <time className="text-xs text-muted-foreground" dateTime={r.createdAt}>{formatDateTime(r.createdAt)}</time>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-muted-foreground">{t('safety.about')}</dt><dd>{r.about || '—'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{t('safety.place')}</dt><dd>{r.place || '—'}</dd></div>
        <div>
          <dt className="text-xs text-muted-foreground">{t('safety.reporter')}</dt>
          <dd>{r.anonymous || !r.reporter ? <span className="inline-flex items-center gap-1 text-muted-foreground"><EyeOff className="size-3.5" />{t('safety.anonymousReporter')}</span>
            : <>{r.reporter.name} · <a className="text-primary hover:underline" href={`mailto:${r.reporter.email}`}>{r.reporter.email}</a></>}</dd>
        </div>
      </dl>
      <p className="mt-3 whitespace-pre-line rounded-xl bg-muted/60 p-3 text-sm">{r.description}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[13rem_minmax(0,1fr)_auto] sm:items-start">
        <Select value={status} onValueChange={v => setStatus(v as SafetyStatus)} aria-label={t('safety.statusLabel')}
          options={STATUSES.map(s => ({ value: s, label: t(`safety.status.${s}`) }))} />
        <Textarea rows={2} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder={t('safety.notePlaceholder')} aria-label={t('safety.answer')} />
        <Button disabled={busy || !dirty} onClick={save}>{t('common.save')}</Button>
      </div>
      {r.handledBy && <p className="mt-2 text-xs text-muted-foreground">{t('safety.handledBy', { name: r.handledBy })}</p>}
    </Card>
  )
}
