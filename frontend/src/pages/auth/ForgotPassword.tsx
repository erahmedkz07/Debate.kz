import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react'
import { forgotPassword } from '@/api'
import { errorMessage } from '@/lib/errors'
import { images } from '@/mocks/images'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { AuthLayout } from './AuthLayout'

// Step 1 of password recovery: ask for the email and send a one-time link
export default function ForgotPassword() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const schema = z.object({ email: z.string().trim().min(1, t('auth.errors.required')).email(t('auth.errors.email')) })
  type Form = z.infer<typeof schema>
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { email: params.get('email') ?? '' },
  })

  const onSubmit = async (v: Form) => {
    setFormError(null)
    try {
      await forgotPassword(v.email.trim())
      // the server answers the same for any email, so we never reveal whether an account exists
      setSentTo(v.email.trim())
    } catch (e) {
      setFormError(errorMessage(e, t))
    }
  }

  return (
    <AuthLayout title={t('reset.forgotTitle')} subtitle={t('reset.forgotSubtitle')} image={images.presentation}>
      {sentTo ? (
        <div className="rounded-2xl border border-success/40 bg-success-soft p-5">
          <MailCheck className="size-8 text-success" />
          <p className="mt-3 font-bold">{t('reset.sentTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('reset.sentText', { email: sentTo })}</p>
          {import.meta.env.DEV && <p className="mt-2 text-xs text-muted-foreground">{t('verify.devHint')}</p>}
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {formError && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">{formError}</p>}
          <div>
            <Label htmlFor="email">{t('auth.email')}</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="name@mail.kz" aria-invalid={!!errors.email} {...register('email')} />
            <FieldError message={errors.email?.message} />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}{t('reset.sendLink')}
          </Button>
        </form>
      )}
      <p className="mt-8 text-center text-sm">
        <Link to="/login" className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline"><ArrowLeft className="size-4" />{t('reset.backToLogin')}</Link>
      </p>
    </AuthLayout>
  )
}
