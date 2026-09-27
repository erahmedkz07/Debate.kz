import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CheckCircle2, Clock, CreditCard, FileText, Loader2, XCircle } from 'lucide-react'
import { claimPayment, getTournamentPayment, receiptUrl } from '@/api'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/states'
import { KaspiPayBox } from './KaspiPayBox'

// Pro payment by Kaspi QR: scan the platform's QR, pay the amount with the reference in the comment,
// attach the receipt and send; an admin checks it and confirms. Until then the tournament stays at 20 teams.
// Normally this is done in the creation wizard; the card is for a rejected payment or a skipped receipt.
export function PaymentCard({ tournamentId }: { tournamentId: string }) {
  const { t } = useTranslation()
  const { data, loading, reload } = useAsync(() => getTournamentPayment(tournamentId), [tournamentId])
  const [note, setNote] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  if (loading && !data) return <Skeleton className="h-48" />
  if (!data?.required) return null

  const claim = async () => {
    if (!receipt) return
    setBusy(true)
    try {
      await claimPayment(tournamentId, note.trim(), receipt)
      toast.success(t('payment.claimed'))
      setNote('')
      setReceipt(null)
      reload()
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }

  const receiptLink = data.hasReceipt && data.id && (
    <a href={receiptUrl(data.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
      <FileText className="size-4" />{t('payment.openReceipt')}
    </a>
  )

  if (data.paid) {
    return (
      <Card className="flex items-start gap-3 p-6">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
        <div className="space-y-1">
          <h3 className="font-bold">{t('payment.paidTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('payment.paidText')}{data.reference && ` · ${data.reference}`}</p>
          {receiptLink}
        </div>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-accent-soft/60 px-6 py-4">
        <h3 className="flex items-center gap-2 font-bold"><CreditCard className="size-5 text-primary" />{t('payment.title')}</h3>
        {data.status === 'pending' && <Badge variant="accent"><Clock className="size-3" />{t('payment.status.pending')}</Badge>}
        {data.status === 'rejected' && <Badge variant="danger"><XCircle className="size-3" />{t('payment.status.rejected')}</Badge>}
      </div>
      <div className="space-y-4 p-6">
        {data.status === 'rejected' && data.adminNote && <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{t('payment.rejectedReason', { reason: data.adminNote })}</p>}
        {data.status === 'pending' ? (
          <div className="space-y-2 rounded-xl bg-primary-soft p-4 text-sm">
            <p>{t('payment.pendingText')}</p>
            <p className="text-muted-foreground">{data.reference}{data.payerNote && ` · ${data.payerNote}`}</p>
            {receiptLink}
          </div>
        ) : (
          <>
            <KaspiPayBox amount={data.amount ?? 0} reference={data.reference ?? ''} kaspi={data.kaspi ?? {}} limit={data.freeTeamLimit}
              note={note} onNote={setNote} receipt={receipt} onReceipt={setReceipt} />
            <div className="flex justify-end border-t border-border pt-4">
              <Button disabled={busy || !receipt || note.trim().length < 2} onClick={claim}>
                {busy && <Loader2 className="size-4 animate-spin" />}{t('payment.claim')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
