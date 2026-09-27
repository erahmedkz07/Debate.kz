import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Copy, FileCheck2, Paperclip, X } from 'lucide-react'
import type { KaspiInfo } from '@/types'
import { cn, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'

export const RECEIPT_TYPES = 'image/png,image/jpeg,image/webp,application/pdf'
const MAX_RECEIPT = 10 * 1024 * 1024

// The Kaspi QR payment: QR (or phone), amount, the payment reference for the comment, then the receipt and
// who paid. Used by the creation wizard (before the tournament exists) and by the tournament settings.
export function KaspiPayBox({ amount, reference, kaspi, limit, note, onNote, receipt, onReceipt }: {
  amount: number; reference: string; kaspi: KaspiInfo; limit: number
  note: string; onNote: (v: string) => void; receipt: File | null; onReceipt: (f: File | null) => void
}) {
  const { t } = useTranslation()
  const file = useRef<HTMLInputElement>(null)
  const copy = async () => {
    try { await navigator.clipboard.writeText(reference); toast.success(t('payment.copied')) } catch { toast(reference) }
  }
  const pick = (f?: File) => {
    if (!f) return
    if (f.size > MAX_RECEIPT) return void toast.error(t('payment.receiptTooBig'))
    onReceipt(f)
  }
  const step = (n: number) => <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{n}</span>

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="flex flex-col items-center gap-2">
        {kaspi.qrUrl
          ? <img src={kaspi.qrUrl} alt={t('payment.qrAlt')} className="aspect-square w-52 rounded-2xl border border-border bg-white object-contain p-2" />
          : <div className="grid aspect-square w-52 place-items-center rounded-2xl border-2 border-dashed border-border p-4 text-center text-xs text-muted-foreground">{t('payment.noQr')}</div>}
        {kaspi.recipient && <p className="text-center text-sm font-semibold">{kaspi.recipient}</p>}
        {kaspi.phone && <p className="text-center text-xs text-muted-foreground">{t('payment.byPhone', { phone: kaspi.phone })}</p>}
      </div>
      <div className="min-w-0 space-y-4">
        <p className="text-sm text-muted-foreground">{t('payment.why', { limit })}</p>
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">{step(1)}{t('payment.step1')}</li>
          <li className="flex flex-wrap items-center gap-3">{step(2)}{t('payment.step2')} <b className="text-lg tabular-nums">{formatNumber(amount)} ₸</b></li>
          <li className="flex flex-wrap items-center gap-3">
            {step(3)}{t('payment.step3')}
            <button type="button" onClick={copy} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-2 border-dashed border-primary px-2.5 py-1 font-mono text-base font-bold tracking-wider text-primary hover:bg-primary-soft">
              {reference}<Copy className="size-3.5" />
            </button>
          </li>
          <li className="flex gap-3">{step(4)}{t('payment.step4')}</li>
        </ol>
        {kaspi.note && <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">{kaspi.note}</p>}
        <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <div>
            <Label>{t('payment.receipt')}</Label>
            <input ref={file} type="file" accept={RECEIPT_TYPES} className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
            {receipt ? (
              <div className="flex h-11 items-center gap-2 rounded-xl border border-success/40 bg-success-soft px-3 text-sm">
                <FileCheck2 className="size-4 shrink-0 text-success" /><span className="min-w-0 flex-1 truncate">{receipt.name}</span>
                <button type="button" onClick={() => onReceipt(null)} aria-label={t('common.delete')} className="cursor-pointer text-muted-foreground hover:text-danger"><X className="size-4" /></button>
              </div>
            ) : (
              <Button type="button" variant="outline" className={cn('w-full justify-start')} onClick={() => file.current?.click()}><Paperclip className="size-4" />{t('payment.attachReceipt')}</Button>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{t('payment.receiptHint')}</p>
          </div>
          <div>
            <Label htmlFor="pay-note">{t('payment.noteLabel')}</Label>
            <Input id="pay-note" maxLength={300} value={note} onChange={e => onNote(e.target.value)} placeholder={t('payment.notePlaceholder')} />
          </div>
        </div>
      </div>
    </div>
  )
}
