import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertCircle, Gavel, Loader2, Mic, Trophy } from 'lucide-react'
import { AuthError, register as registerUser } from '@/api'
import { roleHome, useAuth } from '@/lib/auth'
import { safeNext } from './Login'
import { images } from '@/mocks/images'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { AuthLayout } from './AuthLayout'

const roles = [
  { value: 'participant', icon: Mic },
  { value: 'organizer', icon: Trophy },
  { value: 'judge', icon: Gavel },
] as const

export default function Register() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user, signIn } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)
  const next = safeNext(params.get('next'))
  const schema = z.object({
    name: z.string().trim().min(3, t('auth.errors.name')).refine(v => v.includes(' '), t('auth.errors.name')),
    email: z.string().trim().min(1, t('auth.errors.required')).email(t('auth.errors.email')),
    phone: z.string().trim().regex(/^\+?7\s?\(?7\d{2}\)?\s?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/, t('auth.errors.phone')),
    password: z.string().min(8, t('auth.errors.password')),
    role: z.enum(['organizer', 'participant', 'judge']),
  })
  type Form = z.infer<typeof schema>
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'participant' },
  })
  const role = watch('role')

  if (user) return <Navigate to={next ?? roleHome[user.role]} replace />

  const onSubmit = async (v: Form) => {
    setFormError(null)
    try {
      const u = await registerUser(v)
      signIn(u)
      toast.success(t('auth.registerSuccess'))
      navigate(next ?? roleHome[u.role], { replace: true })
    } catch (e) {
      setFormError(e instanceof AuthError ? t(`auth.errors.${e.code}`) : t('common.error'))
    }
  }

  return (
    <AuthLayout title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')} image={images.studentsLaugh}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {formError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />{formError}
          </p>
        )}
        <div>
          <Label>{t('auth.role')}</Label>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {roles.map(({ value, icon: Icon }) => (
              <button key={value} type="button" role="radio" aria-checked={role === value} onClick={() => setValue('role', value)}
                className={cn('flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-center transition-all',
                  role === value ? 'border-primary bg-primary-soft text-primary' : 'border-border hover:border-primary/40')}>
                <Icon className="size-5" />
                <span className="text-xs font-bold">{t(`auth.roles.${value}`)}</span>
                <span className="hidden text-[10px] leading-tight text-muted-foreground sm:block">{t(`auth.roles.${value}D`)}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="name">{t('auth.name')}</Label>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register('name')} />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="email">{t('auth.email')}</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="name@mail.kz" aria-invalid={!!errors.email} {...register('email')} />
            <FieldError message={errors.email?.message} />
          </div>
          <div>
            <Label htmlFor="phone">{t('auth.phone')}</Label>
            <Input id="phone" type="tel" autoComplete="tel" placeholder="+7 7XX XXX XX XX" aria-invalid={!!errors.phone} {...register('phone')} />
            <FieldError message={errors.phone?.message} />
          </div>
        </div>
        <div>
          <Label htmlFor="password">{t('auth.password')}</Label>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
          <FieldError message={errors.password?.message} />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}{t('auth.registerButton')}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t('auth.hasAccount')} <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-bold text-primary hover:underline">{t('auth.toLogin')}</Link>
      </p>
    </AuthLayout>
  )
}
