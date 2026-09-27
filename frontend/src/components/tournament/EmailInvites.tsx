import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2, Mail, Send, X } from 'lucide-react'
import { getEmailInvites, inviteByEmail, revokeInvite } from '@/api'
import type { EmailInvite } from '@/types'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const stateVariant: Record<EmailInvite['state'], 'accent' | 'success' | 'danger' | 'muted'> = { pending: 'accent', accepted: 'success', declined: 'danger', expired: 'muted' }

// "Invite by email": the person gets an in-site request (Accept / Decline) and a letter; the list shows the answers
// `plain`: no card around it, for use inside another card
export function EmailInvites({ tournamentId, kind, plain }: { tournamentId: string; kind: 'judge' | 'co_organizer'; plain?: boolean }) {
  const { t } = useTranslation()
  const { data, reload } = useAsync(() => getEmailInvites(tournamentId), [tournamentId])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const list = (data ?? []).filter(i => i.kind === kind)
  const valid = /^\S+@\S+\.\S+$/.test(email.trim())

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    try {
      const r = await inviteByEmail(tournamentId, email.trim(), kind)
      toast.success(t(r.registered ? 'emailInvite.sentRegistered' : 'emailInvite.sentNew', { email: r.email }))
      setEmail('')
      reload()
    } catch (err) {
      toast.error(errorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }
  const revoke = async (id: string) => {
    try { await revokeInvite(tournamentId, id); reload() } catch (err) { toast.error(errorMessage(err, t)) }
  }

  const Wrap = plain ? 'div' : Card
  return (
    <Wrap className={plain ? 'border-t border-border pt-4' : 'p-5'}>
      <form onSubmit={send} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="email" className="pl-10" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('emailInvite.placeholder')} aria-label={t(`emailInvite.label.${kind}`)} />
        </div>
        <Button type="submit" disabled={busy || !valid} className="shrink-0">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{t('emailInvite.send')}
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">{t(`emailInvite.hint.${kind}`)}</p>
      {list.length > 0 && (
        <ul className="mt-4 divide-y divide-border border-t border-border">
          {list.map(i => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{i.acceptedBy ? `${i.acceptedBy} · ` : ''}{i.email}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(i.createdAt)}</span>
              <Badge variant={stateVariant[i.state]}>{t(`emailInvite.state.${i.state}`)}</Badge>
              {i.state === 'pending' && (
                <button type="button" onClick={() => revoke(i.id)} title={t('emailInvite.revoke')} aria-label={t('emailInvite.revoke')}
                  className="grid size-7 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-danger-soft hover:text-danger"><X className="size-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Wrap>
  )
}
