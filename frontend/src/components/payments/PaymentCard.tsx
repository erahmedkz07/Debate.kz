import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CheckCircle2, Clock, Copy, CreditCard, Loader2, XCircle } from 'lucide-react'
import { claimPayment, getTournamentPayment } from '@/api'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { formatNumber } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/states'

// Pro payment by Kaspi QR: scan the platform's QR, pay the amount with the reference in the comment,
// press "I have paid"; an admin checks the Kaspi statement and confirms. Until then the tournament stays at 20 teams.
export function PaymentCard({ tournamentId }: { tournamentId: string }) {
  const { t } = useTranslation()
  const { data, loading, reload } = useAsync(() => getTournamentPayment(tournamentId), [tournamentId])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  if (loading && !data) return <Skeleton className="h-48" />
  if (!data?.required) return null

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(t('payment.copied')) } catch { toast(text) }
  }
  const claim = async () => {
    setBusy(true)
    try {
      await claimPayment(tournamentId, note.trim())
      toast.success(t('payment.claimed'))
      setNote('')
      reload()
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }

  if (data.paid) {
    return (
      <Card className="flex items-start gap-3 p-6">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
        <div>
          <h3 className="font-bold">{t('payment.paidTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('payment.paidText')}{data.reference && ` · ${data.reference}`}</p>
        </div>
      </Card>
    )
  }

  const k = data.kaspi ?? {}
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-accent-soft/60 px-6 py-4">
        <h3 className="flex items-center gap-2 font-bold"><CreditCard className="size-5 text-primary" />{t('payment.title')}</h3>
        {data.status === 'pending' && <Badge variant="accent"><Clock className="size-3" />{t('payment.status.pending')}</Badge>}
        {data.status === 'rejected' && <Badge variant="danger"><XCircle className="size-3" />{t('payment.status.rejected')}</Badge>}
      </div>
      <div className="grid gap-6 p-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-2">
          {k.qrUrl
            ? <img src={k.qrUrl} alt={t('payment.qrAlt')} className="aspect-square w-52 rounded-2xl border border-border bg-white object-contain p-2" />
            : <div className="grid aspect-square w-52 place-items-center rounded-2xl border-2 border-dashed border-border p-4 text-center text-xs text-muted-foreground">{t('payment.noQr')}</div>}
          {k.recipient && <p className="text-center text-sm font-semibold">{k.recipient}</p>}
          {k.phone && <p className="text-center text-xs text-muted-foreground">{t('payment.byPhone', { phone: k.phone })}</p>}
        </div>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('payment.why', { limit: data.freeTeamLimit })}</p>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>{t('payment.step1')}</li>
            <li className="flex flex-wrap items-center gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
              {t('payment.step2')} <b className="text-lg tabular-nums">{formatNumber(data.amount ?? 0)} ₸</b>
            </li>
            <li className="flex flex-wrap items-center gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
              {t('payment.step3')}
              <button type="button" onClick={() => copy(data.reference ?? '')} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-2 border-dashed border-primary px-2.5 py-1 font-mono text-base font-bold tracking-wider text-primary hover:bg-primary-soft">
                {data.reference}<Copy className="size-3.5" />
              </button>
            </li>
          </ol>
          {k.note && <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">{k.note}</p>}
          {data.status === 'rejected' && data.adminNote && <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{t('payment.rejectedReason', { reason: data.adminNote })}</p>}
          {data.status === 'pending' ? (
            <p className="rounded-xl bg-primary-soft p-3 text-sm">{t('payment.pendingText')}</p>
          ) : (
            <div className="space-y-2 border-t border-border pt-4">
              <Label htmlFor="pay-note">{t('payment.noteLabel')}</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id="pay-note" maxLength={300} value={note} onChange={e => setNote(e.target.value)} placeholder={t('payment.notePlaceholder')} />
                <Button disabled={busy || note.trim().length < 2} onClick={claim} className="shrink-0">
                  {busy && <Loader2 className="size-4 animate-spin" />}{t('payment.claim')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
