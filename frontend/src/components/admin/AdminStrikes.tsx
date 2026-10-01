import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, Loader2, ShieldAlert } from 'lucide-react'
import { getAdminStrikes, liftStrike, type AdminStrike } from '@/api'
import { errorMessage } from '@/lib/errors'
import { useAsync } from '@/lib/hooks'
import { formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Label, Textarea } from '@/components/ui/input'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'

// Organizer strikes: an abandoned tournament or a last-minute cancellation. 3 active ones close new tournaments to the
// person (the account stays). An admin lifts a strike when the reason was a good one, with a note for the log.
const LIMIT = 3

export function AdminStrikes() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(getAdminStrikes)
  const [lifting, setLifting] = useState<AdminStrike | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  if (error) return <ErrorState onRetry={reload} />
  if (loading || !data) return <Skeleton className="h-96" />

  // grouped by person: the number of active strikes is what matters
  const people = new Map<string, { user: AdminStrike['user']; items: AdminStrike[] }>()
  for (const s of data) {
    const p = people.get(s.user.id) ?? { user: s.user, items: [] }
    p.items.push(s)
    people.set(s.user.id, p)
  }
  const active = (items: AdminStrike[]) => items.filter(s => !s.lifted).length
  const list = [...people.values()].sort((a, b) => active(b.items) - active(a.items))

  const lift = async () => {
    if (!lifting) return
    setBusy(true)
    try {
      await liftStrike(lifting.id, note.trim())
      toast.success(t('strikes.admin.lifted'))
      setLifting(null)
      setNote('')
      reload()
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">{t('strikes.admin.intro', { limit: LIMIT })}</p>
      {list.length === 0 ? <EmptyState icon={<ShieldAlert className="size-7" />} title={t('strikes.admin.empty')} /> : (
        <div className="space-y-3">
          {list.map(({ user, items }) => {
            const n = active(items)
            return (
              <Card key={user.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{user.name}</p>
                  <span className="text-sm text-muted-foreground">{user.email}</span>
                  <Badge variant={n >= LIMIT ? 'danger' : n > 0 ? 'accent' : 'muted'} className="ml-auto">{t('strikes.activeOf', { count: n, limit: LIMIT })}</Badge>
                </div>
                {n >= LIMIT && <p className="mt-2 text-sm font-medium text-danger">{t('strikes.admin.blocked')}</p>}
                <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                  {items.map(s => (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className={s.lifted ? 'text-muted-foreground line-through' : 'font-semibold'}>«{s.tournament}» — {t(`strikes.reason.${s.reason}`)}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(s.createdAt)}{s.note && ` · ${t('strikes.admin.liftedNote', { note: s.note })}`}</p>
                      </div>
                      {!s.lifted && <Button size="sm" variant="outline" onClick={() => setLifting(s)}><Check className="size-4" />{t('strikes.admin.lift')}</Button>}
                    </li>
                  ))}
                </ul>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={!!lifting} onOpenChange={o => !o && setLifting(null)}>
        <DialogContent heading={t('strikes.admin.liftTitle')} description={lifting ? `${lifting.user.name} · «${lifting.tournament}»` : undefined}>
          <Label htmlFor="strike-note">{t('strikes.admin.noteLabel')}</Label>
          <Textarea id="strike-note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={500} placeholder={t('strikes.admin.notePlaceholder')} />
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button onClick={lift} disabled={busy || note.trim().length < 3}>{busy && <Loader2 className="size-4 animate-spin" />}{t('strikes.admin.lift')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
