import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CheckCircle2, EyeOff, LifeBuoy, Phone, Send, ShieldCheck } from 'lucide-react'
import { createSafetyReport, getMySafetyReports } from '@/api'
import type { SafetyCategory } from '@/types'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { cn, formatDateTime } from '@/lib/utils'
import { PageHeader } from '@/components/layout/Layout'
import { loginUrl } from '@/components/auth/guards'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label, Switch, Textarea } from '@/components/ui/input'

export const SAFETY_CATEGORIES: SafetyCategory[] = ['bullying', 'harassment', 'inappropriate', 'threat', 'other']
export const safetyStatusVariant = { open: 'danger', in_progress: 'accent', resolved: 'success' } as const

// "Report behaviour": bullying, harassment, threats at a tournament or on the site.
// The report goes only to the platform admins and the appointed safeguarding officers.
export default function Safety() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [params] = useSearchParams()
  const empty = { category: '' as SafetyCategory | '', about: params.get('about') ?? '', place: params.get('place') ?? '', description: '', anonymous: false }
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const mine = useAsync(() => (user ? getMySafetyReports() : Promise.resolve([])), [user?.id])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.category) return
    setBusy(true)
    try {
      await createSafetyReport({ ...form, category: form.category })
      setSent(true)
      setForm({ ...empty, about: '', place: '' })
      mine.reload()
    } catch (err) {
      toast.error(errorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title={t('safety.title')} subtitle={t('safety.subtitle')} />
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-6">
          {/* immediate danger is not a website matter */}
          <p className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm">
            <Phone className="mt-0.5 size-4 shrink-0 text-danger" />
            <span><b>{t('safety.emergencyTitle')}</b> {t('safety.emergencyText')}</span>
          </p>

          {!user ? (
            <Card className="p-6">
              <p className="text-muted-foreground">{t('safety.loginText')}</p>
              <Button asChild className="mt-4"><Link to={loginUrl('/safety')}>{t('nav.login')}</Link></Button>
            </Card>
          ) : sent ? (
            <Card className="p-6 text-center">
              <CheckCircle2 className="mx-auto size-10 text-success" />
              <h2 className="mt-3 text-xl font-bold">{t('safety.sentTitle')}</h2>
              <p className="mt-2 text-muted-foreground">{t('safety.sentText')}</p>
              <Button variant="outline" className="mt-5" onClick={() => setSent(false)}>{t('safety.another')}</Button>
            </Card>
          ) : (
            <Card className="p-6">
              <form className="space-y-5" onSubmit={submit}>
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">{t('safety.category')}</legend>
                  <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t('safety.category')}>
                    {SAFETY_CATEGORIES.map(c => (
                      <button key={c} type="button" role="radio" aria-checked={form.category === c} onClick={() => setForm({ ...form, category: c })}
                        className={cn('cursor-pointer rounded-xl border-2 p-3 text-left', form.category === c ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/40')}>
                        <span className="block text-sm font-semibold">{t(`safety.categories.${c}`)}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{t(`safety.categoryHints.${c}`)}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label htmlFor="sf-about">{t('safety.about')}</Label><Input id="sf-about" maxLength={200} value={form.about} onChange={e => setForm({ ...form, about: e.target.value })} placeholder={t('safety.aboutPlaceholder')} /></div>
                  <div><Label htmlFor="sf-place">{t('safety.place')}</Label><Input id="sf-place" maxLength={200} value={form.place} onChange={e => setForm({ ...form, place: e.target.value })} placeholder={t('safety.placePlaceholder')} /></div>
                </div>
                <div>
                  <Label htmlFor="sf-text">{t('safety.description')}</Label>
                  <Textarea id="sf-text" rows={6} maxLength={2000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder={t('safety.descriptionPlaceholder')} />
                  <p className="mt-1 text-xs text-muted-foreground">{t('safety.descriptionHint')}</p>
                </div>
                <div className="rounded-xl bg-muted/60 px-4 py-2">
                  <Switch checked={form.anonymous} onChange={v => setForm({ ...form, anonymous: v })} label={t('safety.anonymous')} />
                  <p className="pb-1 text-xs text-muted-foreground">{t(form.anonymous ? 'safety.anonymousOn' : 'safety.anonymousOff')}</p>
                </div>
                <Button type="submit" disabled={busy || !form.category || form.description.trim().length < 20}><Send className="size-4" />{t('safety.submit')}</Button>
              </form>
            </Card>
          )}

          {user && !!mine.data?.length && (
            <section>
              <h2 className="mb-3 text-lg font-bold">{t('safety.myReports')}</h2>
              <Card className="divide-y divide-border">
                {mine.data.map(r => (
                  <div key={r.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{t(`safety.categories.${r.category}`)}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {formatDateTime(r.createdAt)}<Badge variant={safetyStatusVariant[r.status]}>{t(`safety.status.${r.status}`)}</Badge>
                      </span>
                    </div>
                    {r.resolutionNote && <p className="mt-2 text-sm text-muted-foreground">{t('safety.answer')}: {r.resolutionNote}</p>}
                  </div>
                ))}
              </Card>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="size-5 text-primary" />{t('safety.howTitle')}</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>{t('safety.how1')}</li><li>{t('safety.how2')}</li><li>{t('safety.how3')}</li>
            </ol>
          </Card>
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-bold"><EyeOff className="size-5 text-primary" />{t('safety.privacyTitle')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('safety.privacyText')}</p>
          </Card>
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-bold"><LifeBuoy className="size-5 text-primary" />{t('safety.helpTitle')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('safety.helpText')}</p>
          </Card>
        </aside>
      </div>
    </>
  )
}
