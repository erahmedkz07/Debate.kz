import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertCircle, Eye, EyeOff, Gavel, LayoutGrid, Loader2, ShieldCheck, UserRound } from 'lucide-react'
import { AuthError, login } from '@/api'
import type { Role } from '@/types'
import { roleHome, useAuth } from '@/lib/auth'
import { images } from '@/mocks/images'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { AuthLayout } from './AuthLayout'

const demo: { role: Role; email: string; icon: typeof UserRound }[] = [
  { role: 'participant', email: 'student@debate.kz', icon: UserRound },
  { role: 'organizer', email: 'org@debate.kz', icon: LayoutGrid },
  { role: 'judge', email: 'judge@debate.kz', icon: Gavel },
  { role: 'admin', email: 'admin@debate.kz', icon: ShieldCheck },
]

// demo accounts exist only in the dev seed; the hint is hidden in production builds
const DEMO_PASSWORD = 'demo1234'

// only allow in-app redirects (no open redirect to other sites)
export const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : null)

export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user, signIn } = useAuth()
  const [show, setShow] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const next = safeNext(params.get('next'))

  const schema = z.object({
    email: z.string().trim().min(1, t('auth.errors.required')).email(t('auth.errors.email')),
    password: z.string().min(8, t('auth.errors.password')),
  })
  type Form = z.infer<typeof schema>
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  if (user) return <Navigate to={next ?? roleHome[user.role]} replace />

  const onSubmit = async (v: Form) => {
    setFormError(null)
    try {
      const u = await login(v.email, v.password)
      signIn(u)
      toast.success(t('auth.welcome', { name: u.name.split(' ')[0] }))
      navigate(next ?? roleHome[u.role], { replace: true })
    } catch (e) {
      setFormError(e instanceof AuthError ? t(`auth.errors.${e.code}`) : t('common.error'))
    }
  }

  const fillDemo = (email: string) => {
    setValue('email', email, { shouldValidate: true })
    setValue('password', DEMO_PASSWORD, { shouldValidate: true })
    setFormError(null)
  }

  return (
    <AuthLayout title={t('auth.loginTitle')} subtitle={next ? t('authGate.loginToContinue') : t('auth.loginSubtitle')} image={images.presentation}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {formError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />{formError}
          </p>
        )}
        <div>
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="name@mail.kz" aria-invalid={!!errors.email} {...register('email')} />
          <FieldError message={errors.email?.message} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <button type="button" className="mb-1.5 cursor-pointer text-xs font-semibold text-primary hover:underline">{t('auth.forgot')}</button>
          </div>
          <div className="relative">
            <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" aria-invalid={!!errors.password} className="pr-11" {...register('password')} />
            <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground" aria-label="Show password">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <FieldError message={errors.password?.message} />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}{t('auth.loginButton')}
        </Button>
      </form>

      {import.meta.env.DEV && <div className="mt-8 rounded-2xl border border-dashed border-primary/40 bg-primary-soft/40 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">{t('auth.demoTitle')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('auth.demoText', { password: DEMO_PASSWORD })}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {demo.map(({ role, email, icon: Icon }) => (
            <button key={role} type="button" onClick={() => fillDemo(email)}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-xs font-semibold transition-colors hover:border-primary hover:text-primary">
              <Icon className="size-4 shrink-0 text-primary" />{t(`roles.${role}`)}
            </button>
          ))}
        </div>
      </div>}

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t('auth.noAccount')} <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-bold text-primary hover:underline">{t('auth.toRegister')}</Link>
      </p>
    </AuthLayout>
  )
}
