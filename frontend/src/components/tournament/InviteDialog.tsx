import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, Copy, Link2, Loader2 } from 'lucide-react'
import { createInvite } from '@/api'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

// Creates a single-use invite link (judge or co-organizer) and lets the organizer copy it
export function InviteButton({ tournamentId, kind, variant = 'outline' }: { tournamentId: string; kind: 'judge' | 'co_organizer'; variant?: 'outline' | 'primary' }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    setBusy(true)
    try {
      const r = await createInvite(tournamentId, kind)
      setLink({ url: r.url, expiresAt: r.expiresAt })
      setCopied(false)
      setOpen(true)
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link!.url)
      setCopied(true)
      toast.success(t('invite.copied'))
    } catch {
      toast.error(t('invite.copyFailed'))
    }
  }

  return (
    <>
      <Button variant={variant} onClick={generate} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}{t(`invite.create.${kind}`)}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent heading={t(`invite.create.${kind}`)} description={t('invite.dialogText')}>
          {link && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input readOnly value={link.url} onFocus={e => e.currentTarget.select()} aria-label={t('invite.link')} className="font-mono text-xs" />
                <Button onClick={copy} aria-label={t('invite.copy')}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('invite.expires', { date: formatDate(link.expiresAt.slice(0, 10), { day: 'numeric', month: 'long' }) })}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
