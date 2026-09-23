import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2, MailCheck, Send } from 'lucide-react'
import { resendVerification } from '@/api'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'

export function ResendVerification() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const resend = async () => {
    setBusy(true)
    try {
      await resendVerification()
      toast.success(t('verify.sent'))
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button size="sm" variant="accent" onClick={resend} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{t('verify.resend')}
    </Button>
  )
}

// Shown in cabinets until the email is confirmed: creating tournaments, registering teams
// and accepting invites need a verified address
export function EmailBanner() {
  const { t } = useTranslation()
  const { user } = useAuth()
  if (!user || user.emailVerified) return null
  return (
    <div className="border-b border-accent/50 bg-accent-soft">
      <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <MailCheck className="size-5 shrink-0 text-navy dark:text-accent" />
        <p className="min-w-0 flex-1 text-sm">
          <b>{t('verify.bannerTitle')}</b> {t('verify.bannerText', { email: user.email })}
          {import.meta.env.DEV && <span className="ml-1 text-muted-foreground">{t('verify.devHint')}</span>}
        </p>
        <ResendVerification />
      </div>
    </div>
  )
}
