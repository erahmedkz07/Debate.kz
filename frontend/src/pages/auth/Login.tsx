import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { login } from '@/api'
import { images } from '@/mocks/images'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { AuthLayout } from './AuthLayout'

export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [show, setShow] = useState(false)
  const schema = z.object({
    email: z.string().trim().min(1, t('auth.errors.required')).email(t('auth.errors.email')),
    password: z.string().min(8, t('auth.errors.password')),
  })
  type Form = z.infer<typeof schema>
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async (v: Form) => {
    await login(v.email, v.password)
    toast.success(t('auth.loginSuccess'))
    navigate('/dashboard')
  }

  return (
    <AuthLayout title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')} image={images.presentation}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
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
      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t('auth.noAccount')} <Link to="/register" className="font-bold text-primary hover:underline">{t('auth.toRegister')}</Link>
      </p>
    </AuthLayout>
  )
}
