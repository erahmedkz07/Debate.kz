import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { AuthError, login } from '@/api'
import { roleHome, useAuth } from '@/lib/auth'
import { images } from '@/mocks/images'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { AuthLayout } from './AuthLayout'


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
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })
  const emailValue = watch('email')?.trim()

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
            <Link to={`/forgot-password${emailValue ? `?email=${encodeURIComponent(emailValue)}` : ''}`} className="mb-1.5 text-xs font-semibold text-primary hover:underline">{t('auth.forgot')}</Link>
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


      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t('auth.noAccount')} <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-bold text-primary hover:underline">{t('auth.toRegister')}</Link>
      </p>
    </AuthLayout>
  )
}
