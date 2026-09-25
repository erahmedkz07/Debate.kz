import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ImagePlus, Loader2, PartyPopper, Trophy } from 'lucide-react'
import { createTournament, getCities } from '@/api'
import { errorMessage } from '@/lib/errors'
import { useAsync } from '@/lib/hooks'
import { cn, formatDateRange } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FieldError, Input, Label, Switch, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'

const FREE_LIMIT = 12
const steps = ['basic', 'format', 'registration', 'summary'] as const

export default function CreateTournament() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: cities = [] } = useAsync(getCities)
  const [step, setStep] = useState(0)
  const [cover, setCover] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const schema = z.object({
    name: z.string().trim().min(3, t('auth.errors.required')),
    city: z.string().min(1, t('auth.errors.required')),
    startDate: z.string().min(1, t('auth.errors.required')),
    endDate: z.string().min(1, t('auth.errors.required')),
    level: z.enum(['school', 'university']),
    description: z.string().optional(),
    prelims: z.coerce.number().int().min(2).max(8),
    breakSize: z.coerce.number().int().min(2).max(16),
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
    defaultValues: { level: 'school', prelims: 4, breakSize: 4, maxTeams: 12, regOpen: true, approval: true, langRu: true, langKz: true, city: '', startDate: '', endDate: '', regDeadline: '' },
  })
  const v = watch()
  // tournaments cannot start in the past
  const today = new Date().toISOString().slice(0, 10)
  const paid = Number(v.maxTeams) > FREE_LIMIT

  const fieldsByStep: (keyof Form)[][] = [
    ['name', 'city', 'startDate', 'endDate', 'level'],
    ['prelims', 'breakSize'],
    ['maxTeams'],
    [],
  ]
  const next = async () => {
    if (await trigger(fieldsByStep[step])) setStep(s => s + 1)
  }
  const onSubmit = async (f: Form) => {
    try {
      const created = await createTournament({
        name: f.name.trim(), city: f.city, startDate: f.startDate, endDate: f.endDate, level: f.level,
        description: f.description?.trim() ?? '', preliminaryRounds: Number(f.prelims), breakSize: Number(f.breakSize),
        maxTeams: Number(f.maxTeams), registrationOpen: f.regOpen, requireApproval: f.approval,
        registrationDeadline: f.regDeadline || undefined,
        languages: [...(f.langKz ? ['kz' as const] : []), ...(f.langRu ? ['ru' as const] : [])],
      })
      toast.success(t('wizard.created'), {
        description: created.moderation === 'pending' ? t('moderation.sentForReview') : created.autoApproved ? t('trust.published') : undefined,
      })
      navigate(`/dashboard/tournaments/${created.id}/teams`)
    } catch (e) {
      toast.error(errorMessage(e, t))
    }
  }

  const pickFile = (file?: File) => {
    if (file && file.type.startsWith('image/')) setCover(URL.createObjectURL(file))
  }

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
              {step === 0 && (
                <>
                  <div>
                    <Label htmlFor="name">{t('wizard.name')}</Label>
                    <Input id="name" placeholder={t('wizard.namePlaceholder')} aria-invalid={!!errors.name} {...register('name')} />
                    <FieldError message={errors.name?.message} />
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="city">{t('wizard.city')}</Label>
                      <Select id="city" invalid={!!errors.city} value={v.city ?? ''} placeholder={t('wizard.cityPlaceholder')}
                        onValueChange={c => setValue('city', c, { shouldValidate: true })} options={cities.map(c => ({ value: c, label: c }))} />
                      <FieldError message={errors.city?.message} />
                    </div>
                    <div>
                      <Label>{t('wizard.level')}</Label>
                      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-muted p-1">
                        {(['school', 'university'] as const).map(l => (
                          <button key={l} type="button" onClick={() => setValue('level', l)}
                            className={cn('h-9 cursor-pointer rounded-lg text-sm font-semibold transition-all', v.level === l ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground')}>
                            {t(`level.${l}`)}
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
                  </div>
                  <div>
                    <Label htmlFor="desc">{t('wizard.description')}</Label>
                    <Textarea id="desc" rows={3} {...register('description')} />
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <Label>{t('wizard.format')}</Label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="relative rounded-2xl border-2 border-primary bg-primary-soft p-5">
                      <Check className="absolute right-4 top-4 size-5 text-primary" />
                      <Trophy className="size-7 text-primary" />
                      <p className="mt-3 font-bold">World Schools (WSDC)</p>
                      <p className="mt-1 text-sm text-muted-foreground">{t('wizard.wsdcText')}</p>
                    </div>
                    <div className="rounded-2xl border-2 border-dashed border-border p-5 opacity-60">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold">{t('wizard.soon')}</span>
                      <p className="mt-3 font-bold">British Parliamentary</p>
                      <p className="mt-1 text-sm text-muted-foreground">4 × 2</p>
                    </div>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="prelims">{t('wizard.prelims')}</Label>
                      <Select id="prelims" value={String(v.prelims)} onValueChange={n => setValue('prelims', Number(n))}
                        options={[2, 3, 4, 5, 6, 7, 8].map(n => ({ value: String(n), label: String(n) }))} />
                    </div>
                    <div>
                      <Label htmlFor="break">{t('wizard.breakSize')}</Label>
                      <Select id="break" value={String(v.breakSize)} onValueChange={n => setValue('breakSize', Number(n))}
                        options={[2, 4, 8, 16].map(n => ({ value: String(n), label: String(n) }))} />
                    </div>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <Label htmlFor="max">{t('wizard.maxTeams')}</Label>
                    <Input id="max" type="number" min={4} max={128} aria-invalid={!!errors.maxTeams} {...register('maxTeams')} />
                    <FieldError message={errors.maxTeams && '4–128'} />
                  </div>
                  <PlanNotice paid={paid} />
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

              {step === 3 && (
                <>
                  <div className="flex items-center gap-3">
                    <PartyPopper className="size-7 text-primary" />
                    <h2 className="text-xl font-bold">{v.name}</h2>
                  </div>
                  {cover && <img src={cover} alt="" className="h-40 w-full rounded-2xl object-cover" />}
                  <dl className="grid gap-x-6 gap-y-3 rounded-2xl bg-muted/60 p-5 text-sm sm:grid-cols-2">
                    {[
                      [t('wizard.city'), v.city],
                      [t('wizard.level'), t(`level.${v.level}`)],
                      [t('wizard.startDate'), v.startDate && v.endDate ? formatDateRange(v.startDate, v.endDate) : '—'],
                      [t('wizard.format'), 'WSDC'],
                      [t('wizard.prelims'), String(v.prelims)],
                      [t('wizard.breakSize'), String(v.breakSize)],
                      [t('wizard.maxTeams'), String(v.maxTeams)],
                      [t('wizard.languages'), [v.langKz && 'Қазақша', v.langRu && 'Русский'].filter(Boolean).join(', ')],
                    ].map(([k, val]) => (
                      <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-bold">{val}</dd></div>
                    ))}
                  </dl>
                  <PlanNotice paid={paid} />
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </Card>

        <div className="mt-6 flex justify-between gap-3">
          <Button type="button" variant="ghost" onClick={() => setStep(s => s - 1)} disabled={step === 0}><ArrowLeft className="size-4" />{t('common.back')}</Button>
          {step < steps.length - 1
            ? <Button type="button" onClick={next}>{t('common.next')}<ArrowRight className="size-4" /></Button>
            : <Button type="submit" variant="accent" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{t('wizard.create')}</Button>}
        </div>
      </form>
    </div>
  )
}

function PlanNotice({ paid }: { paid: boolean }) {
  const { t } = useTranslation()
  return paid ? (
    <p className="flex items-start gap-3 rounded-2xl border border-accent bg-accent-soft p-4 text-sm font-medium">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-navy dark:text-accent" />{t('wizard.paidNotice')}
    </p>
  ) : (
    <p className="flex items-start gap-3 rounded-2xl bg-success-soft p-4 text-sm font-medium text-success">
      <Check className="mt-0.5 size-5 shrink-0" />{t('wizard.freeNotice')}
    </p>
  )
}
