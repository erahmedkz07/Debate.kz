import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CalendarDays, CheckCircle2, Clock, Gavel, MapPin, Send, Undo2, XCircle } from 'lucide-react'
import { applyToJudge, getJudgeCalls, getJudgeProfile, withdrawApplication } from '@/api'
import type { JudgeCallPublic, JudgeLevel } from '@/types'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { cn, formatDateRange } from '@/lib/utils'
import { PageHeader } from '@/components/layout/Layout'
import { LoginRequiredDialog } from '@/components/auth/guards'
import { LevelBadge } from '@/components/judge/LevelBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Label, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import { Reveal } from '@/components/motion'

const LEVELS: JudgeLevel[] = ['novice', 'judge', 'experienced', 'chief']
const rank = (l: JudgeLevel) => LEVELS.indexOf(l)

// Judge exchange: tournaments that are looking for judges; anyone may apply, organizers pick
export default function JudgeCalls() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const calls = useAsync(getJudgeCalls, [user?.id])
  const profile = useAsync(() => (user ? getJudgeProfile() : Promise.resolve(null)), [user?.id])
  const [city, setCity] = useState('all')
  const [applying, setApplying] = useState<JudgeCallPublic | null>(null)
  const [message, setMessage] = useState('')
  const [gate, setGate] = useState(false)
  const [busy, setBusy] = useState(false)

  const myLevel = profile.data?.level
  const cities = [...new Set((calls.data ?? []).map(c => c.tournament.city))].sort()
  const shown = (calls.data ?? []).filter(c => city === 'all' || c.tournament.city === city)

  const start = (c: JudgeCallPublic) => {
    if (!user) return setGate(true)
    if (!user.emailVerified) return void toast.info(t('apiErrors.email_not_verified'))
    setMessage('')
    setApplying(c)
  }
  const send = async () => {
    setBusy(true)
    try {
      await applyToJudge(applying!.tournament.id, message.trim() || undefined)
      toast.success(t('exchange.applied'))
      setApplying(null)
      calls.reload()
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }
  const withdraw = async (c: JudgeCallPublic) => {
    try {
      await withdrawApplication(c.tournament.id)
      toast(t('exchange.withdrawn'))
      calls.reload()
    } catch (e) {
      toast.error(errorMessage(e, t))
    }
  }

  return (
    <>
      <PageHeader title={t('exchange.title')} subtitle={t('exchange.subtitle')}>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {user && myLevel && (
            <Card className="inline-flex items-center gap-3 px-4 py-2.5">
              <span className="text-sm text-muted-foreground">{t('exchange.yourLevel')}</span>
              <LevelBadge level={myLevel} />
              <Link to="/judge" className="text-sm font-semibold text-primary hover:underline">{t('exchange.howToGrow')}</Link>
            </Card>
          )}
          {cities.length > 1 && (
            <Select className="w-52" value={city} onValueChange={setCity} aria-label={t('common.city')}
              options={[{ value: 'all', label: t('exchange.allCities') }, ...cities.map(c => ({ value: c, label: c }))]} />
          )}
        </div>
      </PageHeader>

      <div className="container-page py-10">
        {calls.error ? <ErrorState onRetry={calls.reload} /> : calls.loading || !calls.data ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>
        ) : shown.length === 0 ? (
          <EmptyState icon={<Gavel className="size-7" />} title={t('exchange.empty')} text={t('exchange.emptyText')} />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((c, i) => {
              const tooLow = !!myLevel && rank(myLevel) < rank(c.minLevel)
              const left = Math.max(0, c.needed - c.accepted)
              return (
                <Reveal key={c.tournament.id} delay={i * 0.05} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <Link to={`/tournaments/${c.tournament.id}`} className="group relative block h-32">
                    <img src={c.tournament.cover} alt="" className="size-full object-cover transition-transform group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-navy/80 to-transparent" />
                    <p className="absolute inset-x-4 bottom-3 line-clamp-2 font-bold text-white">{c.tournament.name}</p>
                  </Link>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="space-y-1.5 text-sm text-muted-foreground">
                      <p className="flex items-center gap-2"><CalendarDays className="size-4 text-primary" />{formatDateRange(c.tournament.startDate, c.tournament.endDate)}</p>
                      <p className="flex items-center gap-2"><MapPin className="size-4 text-primary" />{c.tournament.city} · {t(`level.${c.tournament.level}`)}</p>
                    </div>
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold">{t('exchange.needed', { count: left })}</span>
                        <span className="text-xs text-muted-foreground">{c.accepted}/{c.needed}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (c.accepted / c.needed) * 100)}%` }} />
                      </div>
                    </div>
                    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{t('exchange.minLevel')} <LevelBadge level={c.minLevel} /></p>
                    {c.message && <p className="mt-3 line-clamp-3 text-sm">{c.message}</p>}
                    <div className="mt-auto pt-5">
                      {c.myStatus === 'pending' ? (
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="accent"><Clock className="size-3" />{t('exchange.status.pending')}</Badge>
                          <Button size="sm" variant="ghost" onClick={() => withdraw(c)}><Undo2 className="size-4" />{t('exchange.withdraw')}</Button>
                        </div>
                      ) : c.myStatus === 'accepted' ? (
                        <Badge variant="success"><CheckCircle2 className="size-3" />{t('exchange.status.accepted')}</Badge>
                      ) : c.myStatus === 'declined' ? (
                        <Badge variant="muted"><XCircle className="size-3" />{t('exchange.status.declined')}</Badge>
                      ) : (
                        <>
                          <Button className="w-full" disabled={tooLow} onClick={() => start(c)}><Send className="size-4" />{t('exchange.apply')}</Button>
                          {tooLow && <p className="mt-2 text-center text-xs text-muted-foreground">{t('exchange.tooLow', { level: t(`judgeLevel.${c.minLevel}`) })}</p>}
                        </>
                      )}
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        )}
      </div>

      <LoginRequiredDialog open={gate} onOpenChange={setGate} text={t('exchange.loginText')} />
      <Dialog open={!!applying} onOpenChange={o => !o && setApplying(null)}>
        <DialogContent heading={t('exchange.applyTitle')} description={applying?.tournament.name}>
          <div className={cn('flex items-center gap-2 rounded-xl bg-muted/60 p-3 text-sm')}>
            {t('exchange.yourLevel')} <LevelBadge level={myLevel} />
            <span className="text-xs text-muted-foreground">{t('exchange.levelShared')}</span>
          </div>
          <div className="mt-4">
            <Label htmlFor="app-msg">{t('exchange.message')}</Label>
            <Textarea id="app-msg" rows={3} maxLength={500} value={message} onChange={e => setMessage(e.target.value)} placeholder={t('exchange.messagePlaceholder')} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button disabled={busy} onClick={send}><Send className="size-4" />{t('exchange.send')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
