import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ImagePlus, Loader2, PartyPopper } from 'lucide-react'
import { claimPayment, createTournament, getCoverTemplates, getPlanQuote, uploadTournamentCover } from '@/api'
import { KaspiPayBox } from '@/components/payments/KaspiPayBox'
import { Skeleton } from '@/components/ui/states'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { useAsync } from '@/lib/hooks'
import { cn, formatDateRange, todayKz } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FieldError, Input, Label, Switch, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'

import { FREE_TEAM_LIMIT as FREE_LIMIT } from '@/lib/plans'
import { formatOfTournament, TOURNAMENT_FORMATS } from '@/content/formats'
import { PlacePicker } from '@/components/tournament/PlacePicker'
import { cityName, regionByCode } from '@/content/geo'
import { NumberChoice } from '@/components/ui/number-choice'
type Step = 'basic' | 'format' | 'registration' | 'payment' | 'summary'

// how many top seeds skip the first playoff round when the break is not a power of two (6 -> 2 byes)
const byesOf = (n: number) => (n >= 2 ? 2 ** Math.ceil(Math.log2(n)) - n : 0)

export default function CreateTournament() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const navigate = useNavigate()
  const { user } = useAuth()
  const [step, setStep] = useState(0)
  // the cover: a ready template (saved with the tournament) or the organizer's own picture (uploaded right after)
  const [cover, setCover] = useState<string | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const { data: templates = [] } = useAsync(getCoverTemplates)
  const [dragging, setDragging] = useState(false)

  const schema = z.object({
    name: z.string().trim().min(3, t('auth.errors.required')),
    region: z.string().min(1, t('place.regionRequired')),
    city: z.string().trim().min(2, t('place.cityRequired')).refine(c => c !== '__other__', t('place.cityRequired')),
    district: z.string().optional(),
    venue: z.string().optional(),
    startDate: z.string().min(1, t('auth.errors.required')),
    endDate: z.string().min(1, t('auth.errors.required')),
    level: z.enum(['school', 'university', 'mixed']),
    format: z.enum(TOURNAMENT_FORMATS),
    description: z.string().optional(),
    prelims: z.coerce.number().int().min(1).max(12),
    breakSize: z.coerce.number().int().min(2).max(64),
    maxTeams: z.coerce.number().int().min(4).max(128),
    regOpen: z.boolean(),
    regDeadline: z.string().optional(),
    approval: z.boolean(),
    langRu: z.boolean(),
    langKz: z.boolean(),
  }).refine(v => !v.startDate || !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: t('wizard.errors.dates') })
  type Form = z.input<typeof schema>

  const { register, handleSubmit, trigger, watch, setValue, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { level: 'school', format: 'WSDC', prelims: 4, breakSize: 4, maxTeams: 12, regOpen: true, approval: true, langRu: true, langKz: true, region: '', city: '', district: '', venue: '', startDate: '', endDate: '', regDeadline: '' },
  })
  const v = watch()
  // tournaments cannot start in the past
  const today = todayKz()
  const paid = Number(v.maxTeams) > FREE_LIMIT
  // above the free limit the organizer pays right in the wizard: QR, amount, reference, then the receipt
  const steps: Step[] = paid ? ['basic', 'format', 'registration', 'payment', 'summary'] : ['basic', 'format', 'registration', 'summary']
  const current = steps[Math.min(step, steps.length - 1)]
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof getPlanQuote>> | null>(null)
  const [payNote, setPayNote] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  useEffect(() => {
    if (paid && !quote) getPlanQuote().then(setQuote, e => toast.error(errorMessage(e, t)))
  }, [paid, quote, t])
  const paymentReady = !!quote && !!receipt && payNote.trim().length >= 2

  const fieldsByStep: Record<Step, (keyof Form)[]> = {
    basic: ['name', 'region', 'city', 'startDate', 'endDate', 'level'],
    format: ['prelims', 'breakSize'],
    registration: ['maxTeams'],
    payment: [],
    summary: [],
  }
  const next = async () => {
    if (current === 'payment' && !paymentReady) return void toast.error(t('wizard.payFirst'))
    if (await trigger(fieldsByStep[current])) setStep(s => Math.min(s, steps.length - 1) + 1)
  }
  const onSubmit = async (f: Form) => {
    if (paid && !paymentReady) {
      setStep(steps.indexOf('payment'))
      return void toast.error(t('wizard.payFirst'))
    }
    try {
      const created = await createTournament({
        name: f.name.trim(), city: f.city.trim(), region: f.region, district: f.district?.trim() || undefined, venue: f.venue?.trim() || undefined, startDate: f.startDate, endDate: f.endDate, level: f.level,
        description: f.description?.trim() ?? '', preliminaryRounds: Number(f.prelims), breakSize: Number(f.breakSize),
        maxTeams: Number(f.maxTeams), registrationOpen: f.regOpen, requireApproval: f.approval,
        registrationDeadline: f.regDeadline || undefined,
        languages: [...(f.langKz ? ['kz' as const] : []), ...(f.langRu ? ['ru' as const] : [])],
        coverUrl: cover && !coverFile ? cover : undefined,
        paymentReference: paid ? quote?.reference : undefined,
        format: f.format,
      })
      // the receipt goes to the admin queue at once; if it fails, the organizer can resend it from the settings
      if (paid && receipt) {
        await claimPayment(created.id, payNote.trim(), receipt).catch(e => toast.warning(t('wizard.receiptFailed'), { description: errorMessage(e, t) }))
      }
      // the own picture goes up after the tournament exists; if it fails, the tournament keeps a template
      if (coverFile) await uploadTournamentCover(created.id, coverFile).catch(() => toast.warning(t('wizard.coverFailed')))
      toast.success(t('wizard.created'), { description: paid ? t('wizard.paymentSent') : user?.role === 'admin' ? undefined : t('moderation.sentForReview') })
      navigate(`/dashboard/tournaments/${created.id}/teams`)
    } catch (e) {
      toast.error(errorMessage(e, t))
    }
  }

  const pickFile = (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > 8 * 1024 * 1024) return void toast.error(t('wizard.coverTooBig'))
    setCover(URL.createObjectURL(file))
    setCoverFile(file)
  }
  const pickTemplate = (url: string) => { setCover(url); setCoverFile(null) }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />{t('dashboard.myTournaments')}</Link>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{t('wizard.title')}</h1>

      {/* stepper */}
      <ol className="mt-8 flex items-center">
        {steps.map((s, i) => (
          <li key={s} className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}>
            <button type="button" disabled={i > step} onClick={() => setStep(i)} className="flex cursor-pointer items-center gap-2 disabled:cursor-default">
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold transition-all',
                i < step ? 'bg-success text-white' : i === step ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : 'bg-muted text-muted-foreground')}>
                {i < step ? <Check className="size-4" /> : i + 1}
              </span>
              <span className={cn('hidden text-sm font-semibold sm:block', i === step ? 'text-foreground' : 'text-muted-foreground')}>{t(`wizard.steps.${s}`)}</span>
            </button>
            {i < steps.length - 1 && <span className={cn('mx-3 h-0.5 flex-1 rounded-full', i < step ? 'bg-success' : 'bg-border')} />}
          </li>
        ))}
      </ol>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card className="mt-8 overflow-hidden p-6 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-5">
              {current === 'basic' && (
                <>
                  <div>
                    <Label htmlFor="name">{t('wizard.name')}</Label>
                    <Input id="name" placeholder={t('wizard.namePlaceholder')} aria-invalid={!!errors.name} {...register('name')} />
                    <FieldError message={errors.name?.message} />
                  </div>
                  <PlacePicker value={{ region: v.region ?? '', city: v.city ?? '', district: v.district ?? '', venue: v.venue ?? '' }}
                    invalid={{ region: errors.region?.message, city: errors.city?.message }}
                    onChange={p => {
                      setValue('region', p.region, { shouldValidate: !!errors.region })
                      setValue('city', p.city, { shouldValidate: !!errors.city })
                      setValue('district', p.district)
                      setValue('venue', p.venue)
                    }} />
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div>
                      <Label>{t('wizard.level')}</Label>
                      <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-muted p-1">
                        {(['school', 'university', 'mixed'] as const).map(l => (
                          <button key={l} type="button" onClick={() => setValue('level', l)} aria-pressed={v.level === l}
                            title={l === 'mixed' ? t('level.mixedHint') : t(`level.${l}`)} aria-label={t(`level.${l}`)}
                            className={cn('h-9 cursor-pointer truncate rounded-lg px-1 text-sm font-semibold transition-all', v.level === l ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground')}>
                            {t(`levelShort.${l}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="start">{t('wizard.startDate')}</Label>
                      <DatePicker id="start" value={v.startDate} invalid={!!errors.startDate} min={today}
                        onChange={d => setValue('startDate', d, { shouldValidate: !!errors.startDate })} />
                      <FieldError message={errors.startDate?.message} />
                    </div>
                    <div>
                      <Label htmlFor="end">{t('wizard.endDate')}</Label>
                      <DatePicker id="end" value={v.endDate} invalid={!!errors.endDate} min={v.startDate || today}
                        onChange={d => setValue('endDate', d, { shouldValidate: !!errors.endDate })} />
                      <FieldError message={errors.endDate?.message} />
                    </div>
                  </div>
                  <div>
                    <Label>{t('wizard.cover')}</Label>
                    <label
                      onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
                      onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0]) }}
                      className={cn('relative flex h-44 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed text-center transition-colors',
                        dragging ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/50 hover:bg-muted/50')}>
                      {cover ? <img src={cover} alt="" className="absolute inset-0 size-full object-cover" /> : (
                        <>
                          <ImagePlus className="size-8 text-primary" />
                          <span className="max-w-xs text-sm text-muted-foreground">{t('wizard.coverHint')}</span>
                        </>
                      )}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => pickFile(e.target.files?.[0])} />
                    </label>
                    {templates.length > 0 && (
                      <>
                        <p className="mb-2 mt-3 text-xs font-semibold text-muted-foreground">{t('wizard.coverTemplates')}</p>
                        <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={t('wizard.coverTemplates')}>
                          {templates.map((url, i) => (
                            <button key={url} type="button" role="radio" aria-checked={cover === url} aria-label={t('wizard.coverTemplate', { n: i + 1 })} onClick={() => pickTemplate(url)}
                              className={cn('relative aspect-[3/2] cursor-pointer overflow-hidden rounded-lg ring-offset-2 ring-offset-background transition', cover === url ? 'ring-2 ring-primary' : 'opacity-80 hover:opacity-100')}>
                              <img src={url.replace('w=1200', 'w=240')} alt="" loading="lazy" className="size-full object-cover" />
                              {cover === url && <Check className="absolute right-1 top-1 size-4 rounded-full bg-primary p-0.5 text-primary-foreground" />}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="desc">{t('wizard.description')}</Label>
                    <Textarea id="desc" rows={3} {...register('description')} />
                  </div>
                </>
              )}

              {current === 'format' && (
                <>
                  <Label>{t('wizard.format')}</Label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('wizard.format')}>
                    {TOURNAMENT_FORMATS.map(code => {
                      const f = formatOfTournament(code)
                      const on = v.format === code
                      return (
                        <button key={code} type="button" role="radio" aria-checked={on} onClick={() => { setValue('format', code); if (code === 'BP' && ![4, 8, 16, 32].includes(Number(v.breakSize))) setValue('breakSize', 4) }}
                          className={cn('relative cursor-pointer rounded-2xl border-2 p-5 text-left transition-all', on ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/40')}>
                          {on && <Check className="absolute right-4 top-4 size-5 text-primary" />}
                          <span className={cn('inline-grid h-8 min-w-8 place-items-center rounded-lg bg-gradient-to-br px-2 text-xs font-extrabold text-white', f.accent)}>{f.short}</span>
                          <p className="mt-3 font-bold">{f.name[lang]}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{f.teams[lang]}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{t('wizard.formatScale', { min: f.score.speaker[0], max: f.score.speaker[1] })}</p>
                        </button>
                      )
                    })}
                  </div>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="prelims">{t('wizard.prelims')}</Label>
                      <NumberChoice id="prelims" value={Number(v.prelims)} onChange={n => setValue('prelims', n)} presets={[2, 3, 4, 5, 6, 7, 8]} min={1} max={12} />
                    </div>
                    <div>
                      <Label htmlFor="break">{t('wizard.breakSize')}</Label>
                      {v.format === 'BP' ? (
                        <Select id="break" value={String(v.breakSize)} onValueChange={n => setValue('breakSize', Number(n))}
                          options={[4, 8, 16, 32].map(n => ({ value: String(n), label: String(n) }))} />
                      ) : (
                        <NumberChoice id="break" value={Number(v.breakSize)} onChange={n => setValue('breakSize', n)} presets={[2, 4, 8, 16]} min={2} max={64} />
                      )}
                      {/* a break that is not a power of two: the top seeds go straight to the next round */}
                      {v.format !== 'BP' && byesOf(Number(v.breakSize)) > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">{t('wizard.breakByes', { count: byesOf(Number(v.breakSize)) })}</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {current === 'registration' && (
                <>
                  <div>
                    <Label htmlFor="max">{t('wizard.maxTeams')}</Label>
                    <Input id="max" type="number" min={4} max={128} aria-invalid={!!errors.maxTeams} {...register('maxTeams')} />
                    <FieldError message={errors.maxTeams && '4–128'} />
                  </div>
                  <PlanNotice paid={paid} ready={false} />
                  <div className="divide-y divide-border rounded-2xl border border-border px-4">
                    <div className="py-2"><Switch label={t('wizard.regOpen')} checked={v.regOpen} onChange={c => setValue('regOpen', c)} /></div>
                    <div className="py-2"><Switch label={t('wizard.regApproval')} checked={v.approval} onChange={c => setValue('approval', c)} /></div>
                  </div>
                  <div>
                    <Label htmlFor="deadline">{t('wizard.regDeadline')}</Label>
                    <DatePicker id="deadline" value={v.regDeadline} min={today} max={v.startDate || undefined}
                      onChange={d => setValue('regDeadline', d)} />
                  </div>
                  <div>
                    <Label>{t('wizard.languages')}</Label>
                    <div className="flex gap-2">
                      {([['langKz', 'Қазақша'], ['langRu', 'Русский']] as const).map(([k, label]) => (
                        <button key={k} type="button" onClick={() => setValue(k, !v[k])} aria-pressed={v[k]}
                          className={cn('flex cursor-pointer items-center gap-2 rounded-xl border-2 px-4 py-2 text-sm font-semibold transition-all', v[k] ? 'border-primary bg-primary-soft text-primary' : 'border-border')}>
                          {v[k] && <Check className="size-4" />}{label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {current === 'summary' && (
                <>
                  <div className="flex items-center gap-3">
                    <PartyPopper className="size-7 text-primary" />
                    <h2 className="text-xl font-bold">{v.name}</h2>
                  </div>
                  {cover && <img src={cover} alt="" className="h-40 w-full rounded-2xl object-cover" />}
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-2xl bg-muted/60 p-5 text-sm sm:grid-cols-2">
                    {[
                      [t('wizard.city'), [v.venue, v.district, cityName(v.city ?? '', lang), regionByCode(v.region)?.[lang]].filter(x => x && x !== '__other__').join(', ')],
                      [t('wizard.level'), t(`level.${v.level}`)],
                      [t('wizard.startDate'), v.startDate && v.endDate ? formatDateRange(v.startDate, v.endDate) : '—'],
                      [t('wizard.format'), formatOfTournament(v.format).name[lang]],
                      [t('wizard.prelims'), String(v.prelims)],
                      [t('wizard.breakSize'), String(v.breakSize)],
                      [t('wizard.maxTeams'), String(v.maxTeams)],
                      [t('wizard.languages'), [v.langKz && 'Қазақша', v.langRu && 'Русский'].filter(Boolean).join(', ')],
                    ].map(([k, val]) => (
                      <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-bold">{val}</dd></div>
                    ))}
                  </dl>
                  <PlanNotice paid={paid} ready={paymentReady} />
                </>
              )}

              {current === 'payment' && (
                <>
                  <div>
                    <h2 className="text-xl font-bold">{t('payment.title')}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{t('wizard.payIntro')}</p>
                  </div>
                  {quote
                    ? <KaspiPayBox amount={quote.amount} reference={quote.reference} kaspi={quote.kaspi} limit={quote.freeTeamLimit}
                        note={payNote} onNote={setPayNote} receipt={receipt} onReceipt={setReceipt} />
                    : <Skeleton className="h-64" />}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </Card>

        <div className="mt-6 flex justify-between gap-3">
          <Button type="button" variant="ghost" onClick={() => setStep(s => Math.min(s, steps.length - 1) - 1)} disabled={step === 0}><ArrowLeft className="size-4" />{t('common.back')}</Button>
          {current !== 'summary'
            ? <Button type="button" onClick={next} disabled={current === 'payment' && !paymentReady}>{t('common.next')}<ArrowRight className="size-4" /></Button>
            : <Button type="submit" variant="accent" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{t('wizard.create')}</Button>}
        </div>
      </form>
    </div>
  )
}

function PlanNotice({ paid, ready }: { paid: boolean; ready: boolean }) {
  const { t } = useTranslation()
  if (paid && ready) return (
    <p className="flex items-start gap-3 rounded-2xl bg-primary-soft p-4 text-sm font-medium">
      <Check className="mt-0.5 size-5 shrink-0 text-primary" />{t('wizard.paidReady', { limit: FREE_LIMIT })}
    </p>
  )
  return paid ? (
    <p className="flex items-start gap-3 rounded-2xl border border-accent bg-accent-soft p-4 text-sm font-medium">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-navy dark:text-accent" />{t('wizard.paidNotice', { limit: FREE_LIMIT })}
    </p>
  ) : (
    <p className="flex items-start gap-3 rounded-2xl bg-success-soft p-4 text-sm font-medium text-success">
      <Check className="mt-0.5 size-5 shrink-0" />{t('wizard.freeNotice')}
    </p>
  )
}
