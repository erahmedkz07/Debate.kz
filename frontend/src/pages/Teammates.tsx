import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Flag, MessageCircle, Plus, Send, ShieldCheck, UserPlus, Users, X } from 'lucide-react'
import { closeTeammatePost, createTeammatePost, getCities, getTeammatePosts, replyToTeammatePost } from '@/api'
import type { TeammatePost } from '@/types'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { cn, formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/layout/Layout'
import { LoginRequiredDialog } from '@/components/auth/guards'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Label, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'

const LANGS = ['ru', 'kz', 'en'] as const

// "Find a teammate": looking for a team / looking for a speaker. Contacts are never public —
// a reply reaches the author as a notification.
export default function Teammates() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const filters = { kind: params.get('kind') ?? undefined, city: params.get('city') ?? undefined, level: params.get('level') ?? undefined }
  const { data, loading, error, reload } = useAsync(() => getTeammatePosts(filters), [params.toString(), user?.id])
  const { data: cities = [] } = useAsync(getCities)
  const [gate, setGate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ kind: 'team_needed', city: '', level: 'school', languages: ['ru'] as string[], text: '' })
  const [replying, setReplying] = useState<TeammatePost | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key: string, value?: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    setParams(next, { replace: true })
  }
  const need = (fn: () => void) => () => {
    if (!user) return setGate(true)
    if (!user.emailVerified) return void toast.info(t('apiErrors.email_not_verified'))
    fn()
  }
  const act = async (fn: () => Promise<unknown>, success: string, after?: () => void) => {
    setBusy(true)
    try { await fn(); toast.success(success); after?.(); reload() } catch (e) { toast.error(errorMessage(e, t)) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title={t('teammates.title')} subtitle={t('teammates.subtitle')}>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button onClick={need(() => setCreating(true))}><Plus className="size-4" />{t('teammates.create')}</Button>
          <div className="flex gap-1 rounded-2xl bg-muted p-1">
            {[undefined, 'team_needed', 'speaker_needed'].map(k => (
              <button key={k ?? 'all'} type="button" aria-pressed={filters.kind === k} onClick={() => set('kind', k)}
                className={cn('cursor-pointer rounded-xl px-3 py-1.5 text-sm font-semibold', filters.kind === k ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground')}>
                {k ? t(`teammates.kind.${k}`) : t('teammates.all')}
              </button>
            ))}
          </div>
          <Select className="w-44" value={filters.city ?? 'all'} onValueChange={v => set('city', v === 'all' ? undefined : v)} aria-label={t('common.city')}
            options={[{ value: 'all', label: t('teammates.allCities') }, ...cities.map(c => ({ value: c, label: c }))]} />
          <Select className="w-44" value={filters.level ?? 'all'} onValueChange={v => set('level', v === 'all' ? undefined : v)} aria-label={t('wizard.level')}
            options={[{ value: 'all', label: t('motions.allLevels') }, { value: 'school', label: t('level.school') }, { value: 'university', label: t('level.university') }]} />
        </div>
      </PageHeader>

      <div className="container-page py-10">
        <p className="mb-5 flex items-start gap-2 rounded-2xl bg-primary-soft/60 p-4 text-sm"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />{t('teammates.safety')}</p>
        {error ? <ErrorState onRetry={reload} /> : loading && !data ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-48" />)}</div>
        ) : !data?.length ? (
          <EmptyState icon={<Users className="size-7" />} title={t('teammates.empty')} text={t('teammates.emptyText')} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.map(p => (
              <Card key={p.id} className="flex flex-col p-5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={p.kind === 'team_needed' ? 'primary' : 'accent'}>{p.kind === 'team_needed' ? <Users className="size-3" /> : <UserPlus className="size-3" />}{t(`teammates.kind.${p.kind}`)}</Badge>
                  <Badge variant="muted">{t(`level.${p.level}`)}</Badge>
                  {p.languages.map(l => <Badge key={l} variant="outline">{t(`teammates.lang.${l}`)}</Badge>)}
                </div>
                <p className="mt-3 whitespace-pre-line text-sm">{p.text}</p>
                <p className="mt-3 text-xs text-muted-foreground">{p.author.name}{p.author.institution && ` · ${p.author.institution}`} · {p.city} · {formatDate(p.createdAt)}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                  {p.own ? (
                    <>
                      <Badge variant="muted"><MessageCircle className="size-3" />{t('teammates.replies', { count: p.replies })}</Badge>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => closeTeammatePost(p.id), t('teammates.closed'))}><X className="size-4" />{t('teammates.close')}</Button>
                    </>
                  ) : p.replied ? <Badge variant="success">{t('teammates.replied')}</Badge> : (
                    <Button size="sm" onClick={need(() => { setMessage(''); setReplying(p) })}><Send className="size-4" />{t('teammates.reply')}</Button>
                  )}
                  {!p.own && (
                    <Link to={`/safety?place=${encodeURIComponent(t('teammates.title'))}&about=${encodeURIComponent(p.author.name)}`} className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-danger">
                      <Flag className="size-3.5" />{t('safety.reportShort')}
                    </Link>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <LoginRequiredDialog open={gate} onOpenChange={setGate} text={t('teammates.loginText')} />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent heading={t('teammates.create')} description={t('teammates.createText')}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void act(() => createTeammatePost(form), t('teammates.created'), () => { setCreating(false); setForm({ ...form, text: '' }) }) }}>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t('teammates.kindLabel')}>
              {['team_needed', 'speaker_needed'].map(k => (
                <button key={k} type="button" role="radio" aria-checked={form.kind === k} onClick={() => setForm({ ...form, kind: k })}
                  className={cn('cursor-pointer rounded-xl border-2 p-3 text-left text-sm font-semibold', form.kind === k ? 'border-primary bg-primary-soft' : 'border-border')}>
                  {t(`teammates.kind.${k}`)}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="tm-city">{t('common.city')}</Label><Select id="tm-city" value={form.city} placeholder={t('wizard.cityPlaceholder')} onValueChange={v => setForm({ ...form, city: v })} options={cities.map(c => ({ value: c, label: c }))} /></div>
              <div><Label htmlFor="tm-level">{t('wizard.level')}</Label><Select id="tm-level" value={form.level} onValueChange={v => setForm({ ...form, level: v })} options={[{ value: 'school', label: t('level.school') }, { value: 'university', label: t('level.university') }]} /></div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              {LANGS.map(l => (
                <label key={l} className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={form.languages.includes(l)}
                    onChange={e => setForm({ ...form, languages: e.target.checked ? [...form.languages, l] : form.languages.filter(x => x !== l) })} />
                  {t(`teammates.lang.${l}`)}
                </label>
              ))}
            </div>
            <div>
              <Label htmlFor="tm-text">{t('teammates.text')}</Label>
              <Textarea id="tm-text" rows={4} maxLength={500} value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} placeholder={t('teammates.textPlaceholder')} />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
              <Button type="submit" disabled={busy || !form.city || form.text.trim().length < 10 || !form.languages.length}>{t('teammates.publish')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!replying} onOpenChange={o => !o && setReplying(null)}>
        <DialogContent heading={t('teammates.replyTitle')} description={replying?.author.name}>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); void act(() => replyToTeammatePost(replying!.id, message.trim()), t('teammates.sent'), () => setReplying(null)) }}>
            <Textarea rows={4} maxLength={300} value={message} onChange={e => setMessage(e.target.value)} placeholder={t('teammates.replyPlaceholder')} aria-label={t('teammates.reply')} />
            <p className="text-xs text-muted-foreground">{t('teammates.replyHint')}</p>
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
              <Button type="submit" disabled={busy || message.trim().length < 5}><Send className="size-4" />{t('teammates.send')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
