import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react'
import { AuthError, register as registerUser } from '@/api'
import { roleHome, useAuth } from '@/lib/auth'
import { safeNext } from './Login'
import { images } from '@/mocks/images'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { AuthLayout } from './AuthLayout'

// No role picker: everyone registers as a plain user. Organizing comes from creating a tournament,
// judging from an organizer's invite, admin rights are granted only by another admin.
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
    consent: z.literal(true, { error: t('auth.errors.consent') }),
  })
  type Form = z.infer<typeof schema>
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  if (user) return <Navigate to={next ?? roleHome[user.role]} replace />

  const onSubmit = async (v: Form) => {
    setFormError(null)
    try {
      const u = await registerUser(v)
      signIn(u)
      toast.success(t('auth.registerSuccess'), { description: t('verify.checkInbox', { email: u.email }) })
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

        <div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-border p-3 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary-soft/40">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--primary)]" aria-invalid={!!errors.consent} {...register('consent')} />
            <span className="text-muted-foreground">{t('auth.consent')}</span>
          </label>
          <FieldError message={errors.consent?.message} />
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}{t('auth.registerButton')}
        </Button>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />{t('auth.rolesHint')}
        </p>
      </form>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t('auth.hasAccount')} <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-bold text-primary hover:underline">{t('auth.toLogin')}</Link>
      </p>
    </AuthLayout>
  )
}
