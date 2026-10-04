import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, Copy, Link2, Loader2 } from 'lucide-react'
import { createSpeakerInvite } from '@/api'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

// Next to a teammate typed in by name: the captain (or an organizer) makes a single-use link that lets the teammate
// link their account to this speaker slot, so the tournament joins their career.
export function SpeakerInviteButton({ speakerId, name }: { speakerId: string; name: string }) {
  const { t } = useTranslation()
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const make = async () => {
    setBusy(true)
    try {
      setLink(await createSpeakerInvite(speakerId))
      setCopied(false)
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
      <button type="button" onClick={make} disabled={busy} title={t('speakerInvite.button', { name })} aria-label={t('speakerInvite.button', { name })}
        className="ml-1.5 inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary-soft">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}{t('speakerInvite.short')}
      </button>
      <Dialog open={!!link} onOpenChange={o => !o && setLink(null)}>
        <DialogContent heading={t('speakerInvite.button', { name })} description={t('speakerInvite.dialogText', { name })}>
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
