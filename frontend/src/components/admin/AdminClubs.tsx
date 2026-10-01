import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AlertTriangle, Check, ExternalLink, GitMerge, Loader2, Search, Shield, Trash2, X } from 'lucide-react'
import { adminDeleteClub, getAdminClubs, mergeClub, resolveClubReport, reviewClub, type AdminClub } from '@/api'
import { errorMessage } from '@/lib/errors'
import { useAsync } from '@/lib/hooks'
import { cn, formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { EntityLogo } from '@/components/ui/entity-logo'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'

// Clubs for the admins: a new club waits here until it is approved; reports about fakes and duplicates come here too.
// Approve, reject with a reason (the members fix and resend), merge a duplicate into the real club, or delete a fake.
type Dialogs = { kind: 'reject' | 'delete' | 'merge'; club: AdminClub } | null
const statusLook = { pending: 'accent', approved: 'success', rejected: 'danger' } as const

export function AdminClubs({ onChange }: { onChange?: () => void }) {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(getAdminClubs)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'reported'>('all')
  const [q, setQ] = useState('')
  const [dialog, setDialog] = useState<Dialogs>(null)
  const [text, setText] = useState('')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key)
    try {
      await fn()
      toast.success(done)
      setDialog(null)
      setText('')
      reload()
      onChange?.()
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(null)
    }
  }
  if (error) return <ErrorState onRetry={reload} />
  if (loading || !data) return <Skeleton className="h-96" />
  const query = q.trim().toLowerCase()
  const shown = data
    .filter(c => filter === 'all' || (filter === 'reported' ? c.reports.length > 0 : c.status === filter))
    .filter(c => !query || [c.name, c.city, c.institution, c.createdBy].some(v => v?.toLowerCase().includes(query)))

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t('admin.clubs.search')} className="pl-10" aria-label={t('common.search')} />
        </div>
        <Select className="w-56" value={filter} onValueChange={v => setFilter(v as typeof filter)} aria-label={t('admin.clubs.filter')}
          options={(['all', 'pending', 'approved', 'rejected', 'reported'] as const).map(f => ({ value: f, label: t(`admin.clubs.filters.${f}`) }))} />
      </div>
      {shown.length === 0 ? <EmptyState icon={<Shield className="size-7" />} title={t('admin.clubs.empty')} /> : (
        <div className="space-y-3">
          {shown.map(c => (
            <Card key={c.id} className={cn('p-5', c.status === 'pending' && 'ring-2 ring-accent')}>
              <div className="flex flex-wrap items-start gap-4">
                <EntityLogo src={c.logoUrl} name={c.name} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    {c.name}<Badge variant={statusLook[c.status]}>{t(`admin.clubs.status.${c.status}`)}</Badge>
                    {c.reports.length > 0 && <Badge variant="danger"><AlertTriangle className="size-3" />{t('admin.clubs.reportsN', { count: c.reports.length })}</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">{[c.city, c.institution].filter(Boolean).join(' · ')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('admin.clubs.meta', { members: c.members, teams: c.teams, entries: c.tournamentTeams })}
                    {c.createdBy && ` · ${t('admin.clubs.createdBy', { name: c.createdBy })}`} · {formatDateTime(c.createdAt)}
                  </p>
                  {c.moderationNote && <p className="mt-1 text-xs text-danger">{t('admin.clubs.reason')}: {c.moderationNote}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="ghost" size="sm"><Link to={`/clubs/${c.id}`} target="_blank"><ExternalLink className="size-4" />{t('admin.clubs.open')}</Link></Button>
                  {c.status !== 'approved' && (
                    <Button size="sm" disabled={!!busy} onClick={() => run(`a-${c.id}`, () => reviewClub(c.id, 'approved'), t('admin.clubs.approved'))}>
                      {busy === `a-${c.id}` ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{t('admin.clubs.approve')}
                    </Button>
                  )}
                  {c.status !== 'rejected' && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setDialog({ kind: 'reject', club: c })}><X className="size-4" />{t('admin.clubs.reject')}</Button>}
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => { setTarget(''); setDialog({ kind: 'merge', club: c }) }}><GitMerge className="size-4" />{t('admin.clubs.merge')}</Button>
                  <Button size="icon" variant="ghost" className="hover:text-danger" aria-label={t('common.delete')} disabled={!!busy} onClick={() => setDialog({ kind: 'delete', club: c })}><Trash2 className="size-4" /></Button>
                </div>
              </div>
              {c.reports.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-border pt-3">
                  {c.reports.map(r => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-danger-soft/50 px-3 py-2 text-sm">
                      <span><b>{r.by}</b>: {r.reason} <span className="text-xs text-muted-foreground">· {formatDateTime(r.createdAt)}</span></span>
                      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run(`r-${r.id}`, () => resolveClubReport(r.id), t('admin.clubs.resolved'))}>{t('admin.clubs.resolve')}</Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={o => !o && setDialog(null)}>
        {dialog && (
          <DialogContent heading={t(`admin.clubs.${dialog.kind}Title`, { name: dialog.club.name })} description={t(`admin.clubs.${dialog.kind}Text`)}>
            {dialog.kind === 'merge' ? (
              <div>
                <Label htmlFor="merge-into">{t('admin.clubs.mergeInto')}</Label>
                <Select id="merge-into" value={target} placeholder={t('admin.clubs.pickClub')} onValueChange={setTarget}
                  options={data.filter(x => x.id !== dialog.club.id && x.status === 'approved').map(x => ({ value: x.id, label: `${x.name} · ${x.city}` }))} />
              </div>
            ) : (
              <div>
                <Label htmlFor="club-reason">{t('admin.clubs.reason')}</Label>
                <Textarea id="club-reason" rows={3} maxLength={500} value={text} onChange={e => setText(e.target.value)} autoFocus />
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <DialogClose asChild><Button variant="ghost">{t('common.cancel')}</Button></DialogClose>
              <Button variant={dialog.kind === 'delete' ? 'danger' : 'primary'} disabled={!!busy || (dialog.kind === 'merge' ? !target : text.trim().length < 5)}
                onClick={() => {
                  const c = dialog.club
                  if (dialog.kind === 'reject') void run('dlg', () => reviewClub(c.id, 'rejected', text.trim()), t('admin.clubs.rejected'))
                  else if (dialog.kind === 'delete') void run('dlg', () => adminDeleteClub(c.id, text.trim()), t('admin.clubs.deleted'))
                  else void run('dlg', () => mergeClub(c.id, target), t('admin.clubs.merged'))
                }}>
                {busy === 'dlg' && <Loader2 className="size-4 animate-spin" />}{t(`admin.clubs.${dialog.kind}`)}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
