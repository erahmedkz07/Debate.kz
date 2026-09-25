import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Loader2, MailWarning } from 'lucide-react'
import { verifyEmail } from '@/api'
import { roleHome, useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { ResendVerification } from '@/components/auth/EmailBanner'

// Landing page of the link from the verification email
export default function VerifyEmail() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const { user, signIn } = useAuth()
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const once = useRef(false) // StrictMode runs effects twice; the token is single-use

  useEffect(() => {
    if (once.current) return
    once.current = true
    const token = params.get('token')
    if (!token) {
      setState('error')
      setMessage(t('apiErrors.invalid_or_expired_token'))
      return
    }
    verifyEmail(token)
      .then(u => { if (user) signIn(u); setState('done') })
      .catch(e => { setState('error'); setMessage(errorMessage(e, t)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className="container-page grid min-h-[60vh] max-w-lg place-items-center py-16 text-center">
      {state === 'loading' && <Loader2 className="size-10 animate-spin text-primary" />}
      {state === 'done' && (
        <div>
          <span className="mx-auto grid size-20 place-items-center rounded-full bg-success-soft text-success"><CheckCircle2 className="size-10" /></span>
          <h1 className="mt-6 text-3xl font-extrabold">{t('verify.doneTitle')}</h1>
          <p className="mt-2 text-muted-foreground">{t('verify.doneText')}</p>
          <Button asChild size="lg" className="mt-8"><Link to={user ? roleHome[user.role] : '/login'}>{user ? t('authGate.toCabinet') : t('nav.login')}</Link></Button>
        </div>
      )}
      {state === 'error' && (
        <div>
          <span className="mx-auto grid size-20 place-items-center rounded-full bg-danger-soft text-danger"><MailWarning className="size-10" /></span>
          <h1 className="mt-6 text-3xl font-extrabold">{t('verify.errorTitle')}</h1>
          <p className="mt-2 text-muted-foreground">{message}</p>
          <div className="mt-8">{user && !user.emailVerified ? <ResendVerification /> : <Button asChild variant="outline"><Link to="/">{t('notFound.home')}</Link></Button>}</div>
        </div>
      )}
    </section>
  )
}
