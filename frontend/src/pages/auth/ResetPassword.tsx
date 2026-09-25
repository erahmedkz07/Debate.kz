import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { resetPassword } from '@/api'
import { roleHome, useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { images } from '@/mocks/images'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { AuthLayout } from './AuthLayout'

// Step 2 of password recovery: the page opened from the email link
export default function ResetPassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { signIn } = useAuth()
  const token = params.get('token') ?? ''
  const [show, setShow] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const schema = z.object({
    password: z.string().min(8, t('auth.errors.password')),
    confirm: z.string(),
  }).refine(v => v.password === v.confirm, { path: ['confirm'], message: t('reset.mismatch') })
  type Form = z.infer<typeof schema>
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async (v: Form) => {
    setFormError(null)
    try {
      const user = await resetPassword(token, v.password)
      signIn(user)
      toast.success(t('reset.done'))
      navigate(roleHome[user.role], { replace: true })
    } catch (e) {
      setFormError(errorMessage(e, t))
    }
  }

  if (!token) {
    return (
      <AuthLayout title={t('reset.newTitle')} subtitle="" image={images.presentation}>
        <p className="rounded-xl bg-danger-soft p-4 text-sm font-medium text-danger">{t('apiErrors.invalid_or_expired_token')}</p>
        <Button asChild variant="outline" className="mt-6"><Link to="/forgot-password">{t('reset.requestNew')}</Link></Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t('reset.newTitle')} subtitle={t('reset.newSubtitle')} image={images.presentation}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {formError && (
          <div role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">
            {formError} <Link to="/forgot-password" className="underline">{t('reset.requestNew')}</Link>
          </div>
        )}
        <div>
          <Label htmlFor="password">{t('reset.newPassword')}</Label>
          <div className="relative">
            <Input id="password" type={show ? 'text' : 'password'} autoComplete="new-password" aria-invalid={!!errors.password} className="pr-11" {...register('password')} />
            <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground" aria-label="Show password">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <FieldError message={errors.password?.message} />
        </div>
        <div>
          <Label htmlFor="confirm">{t('reset.confirmPassword')}</Label>
          <Input id="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" aria-invalid={!!errors.confirm} {...register('confirm')} />
          <FieldError message={errors.confirm?.message} />
        </div>
        <p className="text-xs text-muted-foreground">{t('reset.sessionsNote')}</p>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}{t('reset.save')}
        </Button>
      </form>
    </AuthLayout>
  )
}
