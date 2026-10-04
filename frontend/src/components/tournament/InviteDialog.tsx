import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, Copy, Link2, Loader2, Plus } from 'lucide-react'
import { createInvite } from '@/api'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'

const MAX_AT_ONCE = 30

// Creates a single-use invite link (judge or co-organizer) and lets the organizer copy it. Judges: more links can be
// made at once (one per judge, each still single-use) and copied together as a numbered list for a chat.
export function InviteButton({ tournamentId, kind, variant = 'outline' }: { tournamentId: string; kind: 'judge' | 'co_organizer'; variant?: 'outline' | 'primary' }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [links, setLinks] = useState<string[]>([])
  const [expiresAt, setExpiresAt] = useState('')
  const [copied, setCopied] = useState<number | 'all' | null>(null)
  const [more, setMore] = useState('5')

  const generate = async (count: number, append: boolean) => {
    setBusy(true)
    try {
      const r = await createInvite(tournamentId, kind, count)
      setLinks(prev => [...(append ? prev : []), ...r.links.map(l => l.url)])
      setExpiresAt(r.expiresAt)
      setCopied(null)
      setOpen(true)
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text: string, which: number | 'all') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      toast.success(t(which === 'all' ? 'invite.copiedAll' : 'invite.copied'))
    } catch {
      toast.error(t('invite.copyFailed'))
    }
  }
  const moreCount = Math.min(MAX_AT_ONCE, Math.max(1, Number(more) || 1))

  return (
    <>
      <Button variant={variant} onClick={() => generate(1, false)} disabled={busy}>
        {busy && !open ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}{t(`invite.create.${kind}`)}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent heading={t(`invite.create.${kind}`)} description={t('invite.dialogText')}>
          {links.length > 0 && (
            <div className="space-y-3">
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {links.map((url, i) => (
                  <li key={url} className="flex items-center gap-2">
                    {links.length > 1 && <span className="w-6 shrink-0 text-right text-xs font-bold text-muted-foreground">{i + 1}.</span>}
                    <Input readOnly value={url} onFocus={e => e.currentTarget.select()} aria-label={t('invite.link')} className="font-mono text-xs" />
                    <Button size="sm" variant={links.length > 1 ? 'outline' : 'primary'} onClick={() => copy(url, i)} aria-label={t('invite.copy')}>
                      {copied === i ? <Check className="size-4" /> : <Copy className="size-4" />}
                    </Button>
                  </li>
                ))}
              </ul>
              {links.length > 1 && (
                <Button variant="primary" className="w-full" onClick={() => copy(links.map((url, i) => `${i + 1}. ${url}`).join('\n'), 'all')}>
                  {copied === 'all' ? <Check className="size-4" /> : <Copy className="size-4" />}{t('invite.copyAll', { count: links.length })}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">{t('invite.expires', { date: formatDate(expiresAt.slice(0, 10), { day: 'numeric', month: 'long' }) })}</p>
              {kind === 'judge' && (
                <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
                  <div>
                    <Label htmlFor={`more-${tournamentId}`}>{t('invite.moreLabel')}</Label>
                    <Input id={`more-${tournamentId}`} type="number" min={1} max={MAX_AT_ONCE} value={more} onChange={e => setMore(e.target.value)} className="w-24" />
                  </div>
                  <Button variant="outline" disabled={busy} onClick={() => generate(moreCount, true)}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{t('invite.moreButton', { count: moreCount })}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
