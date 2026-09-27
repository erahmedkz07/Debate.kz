import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, CreditCard, ImageUp, X } from 'lucide-react'
import { getAdminPayments, getPlatformSettings, handlePayment, updatePlatformSettings, uploadKaspiQr } from '@/api'
import type { AdminPayment, PaymentStatus } from '@/types'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { formatDateTime, formatNumber } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label, Textarea } from '@/components/ui/input'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'

const statusVariant: Record<PaymentStatus, 'accent' | 'success' | 'danger' | 'muted'> = { pending: 'accent', confirmed: 'success', rejected: 'danger', awaiting: 'muted' }

// Kaspi QR details and price, shown to organizers of Pro tournaments
function KaspiSettings() {
  const { t } = useTranslation()
  const { data, reload } = useAsync(getPlatformSettings)
  const [f, setF] = useState({ proPrice: '', recipient: '', phone: '', note: '' })
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { if (data) setF({ proPrice: String(data.proPrice), recipient: data.recipient ?? '', phone: data.phone ?? '', note: data.note ?? '' }) }, [data])
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn(); toast.success(t('common.saved')); reload() } catch (e) { toast.error(errorMessage(e, t)) } finally { setBusy(false) }
  }
  if (!data) return <Skeleton className="h-64" />
  const price = Number(f.proPrice)
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 font-bold"><CreditCard className="size-4 text-primary" />{t('payment.admin.settings')}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t('payment.admin.settingsText', { limit: data.freeTeamLimit })}</p>
      <div className="mt-5 grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-2">
          {data.qrUrl
            ? <img src={data.qrUrl} alt="Kaspi QR" className="aspect-square w-44 rounded-2xl border border-border bg-white object-contain p-2" />
            : <div className="grid aspect-square w-44 place-items-center rounded-2xl border-2 border-dashed border-border p-3 text-center text-xs text-muted-foreground">{t('payment.admin.noQr')}</div>}
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={e => { const x = e.target.files?.[0]; e.target.value = ''; if (x) void act(() => uploadKaspiQr(x)) }} />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => file.current?.click()}><ImageUp className="size-4" />{t('payment.admin.uploadQr')}</Button>
        </div>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void act(() => updatePlatformSettings({ proPrice: price, recipient: f.recipient, phone: f.phone, note: f.note })) }}>
          <div><Label htmlFor="ps-price">{t('payment.admin.price')}</Label><Input id="ps-price" inputMode="numeric" value={f.proPrice} onChange={e => setF({ ...f, proPrice: e.target.value.replace(/\D/g, '') })} /></div>
          <div><Label htmlFor="ps-rec">{t('payment.admin.recipient')}</Label><Input id="ps-rec" maxLength={100} value={f.recipient} onChange={e => setF({ ...f, recipient: e.target.value })} placeholder="Ермек А." /></div>
          <div className="sm:col-span-2"><Label htmlFor="ps-phone">{t('payment.admin.phone')}</Label><Input id="ps-phone" maxLength={30} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="+7 7XX XXX XX XX" /></div>
          <div className="sm:col-span-2"><Label htmlFor="ps-note">{t('payment.admin.note')}</Label><Textarea id="ps-note" rows={2} maxLength={500} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></div>
          <div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={busy || !f.proPrice}>{t('common.save')}</Button></div>
        </form>
      </div>
    </Card>
  )
}

function PaymentRow({ p, onDone }: { p: AdminPayment; onDone: () => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const act = async (status: 'confirmed' | 'rejected') => {
    setBusy(true)
    try { await handlePayment(p.id, status, status === 'rejected' ? reason.trim() : undefined); toast.success(t(`payment.admin.done.${status}`)); onDone() } catch (e) { toast.error(errorMessage(e, t)) } finally { setBusy(false) }
  }
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant[p.status]}>{t(`payment.status.${p.status}`)}</Badge>
            <span className="font-mono font-bold tracking-wider">{p.reference}</span>
            <b className="tabular-nums">{formatNumber(p.amount)} ₸</b>
          </p>
          <p className="mt-1 text-sm"><Link to={`/tournaments/${p.tournament.id}`} className="font-semibold text-primary hover:underline">«{p.tournament.name}»</Link> · {t('payment.admin.teams', { n: p.tournament.maxTeams })}</p>
          {p.payer && <p className="text-xs text-muted-foreground">{p.payer.name} · {p.payer.email}</p>}
          {p.payerNote && <p className="mt-1 text-sm">{t('payment.admin.payerNote')}: <i>{p.payerNote}</i></p>}
          {p.adminNote && <p className="mt-1 text-xs text-danger">{p.adminNote}</p>}
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {p.paidAt && <p>{t('payment.admin.claimedAt')}: {formatDateTime(p.paidAt)}</p>}
          {p.handledBy && p.handledAt && <p>{p.handledBy} · {formatDateTime(p.handledAt)}</p>}
        </div>
      </div>
      {p.status === 'pending' && (
        rejecting ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input autoFocus maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder={t('payment.admin.reasonPlaceholder')} aria-label={t('payment.admin.reason')} />
            <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => act('rejected')}>{t('payment.admin.reject')}</Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>{t('common.cancel')}</Button>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => act('confirmed')}><Check className="size-4" />{t('payment.admin.confirm')}</Button>
            <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => setRejecting(true)}><X className="size-4" />{t('payment.admin.reject')}</Button>
          </div>
        )
      )}
    </div>
  )
}

export function AdminPayments() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(getAdminPayments)
  return (
    <div className="space-y-5">
      <p className="rounded-2xl bg-primary-soft/60 p-4 text-sm">{t('payment.admin.howTo')}</p>
      {error ? <ErrorState onRetry={reload} /> : loading && !data ? <Skeleton className="h-48" /> : !data?.length ? (
        <EmptyState icon={<CreditCard className="size-7" />} title={t('payment.admin.empty')} />
      ) : (
        <Card className="divide-y divide-border">{data.map(p => <PaymentRow key={p.id} p={p} onDone={reload} />)}</Card>
      )}
      <KaspiSettings />
    </div>
  )
}
