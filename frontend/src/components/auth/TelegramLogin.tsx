import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, X } from 'lucide-react'
import { getTelegramConfig, pollTelegramLogin, startTelegramLogin } from '@/api'
import { ApiError } from '@/api/http'
import { useAsync } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { TelegramIcon } from '@/components/brand'
import type { User } from '@/types'

const button = 'flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-xl bg-[#2AABEE] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#229ED9] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:opacity-70'

// "Sign in with Telegram": the bot opens with a sign-in request, the person confirms there, this page signs in.
// No password and no code to type; with two-step sign-in the app's code is still asked afterwards (onTicket).
// Hidden while the server has no bot.
export function TelegramLoginButton({ onUser, onTicket, onError, className }: {
  onUser: (u: User) => void; onTicket: (ticket: string) => void; onError: (message: string) => void; className?: string
}) {
  const { t } = useTranslation()
  const { data } = useAsync(getTelegramConfig)
  const [waiting, setWaiting] = useState<{ url: string; secret: string; until: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const stopped = useRef(false)

  // ask every 2 seconds while the request lives; stop when the page is left or the person cancels
  useEffect(() => {
    if (!waiting) return
    stopped.current = false
    const timer = setInterval(async () => {
      if (stopped.current) return
      if (Date.now() > waiting.until) { setWaiting(null); onError(t('telegramLogin.expired')); return }
      try {
        const r = await pollTelegramLogin(waiting.secret)
        if (stopped.current || r.status === 'pending') return
        stopped.current = true
        setWaiting(null)
        if (r.status === 'ok') onUser(r.user)
        else onTicket(r.ticket)
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) return // offline for a moment: ask again
        stopped.current = true
        setWaiting(null)
        onError(t(e instanceof ApiError && e.code === 'login_denied' ? 'telegramLogin.denied' : 'telegramLogin.expired'))
      }
    }, 2000)
    return () => { stopped.current = true; clearInterval(timer) }
  }, [waiting, onUser, onTicket, onError, t])

  if (!data?.enabled) return null

  const start = async () => {
    // the tab is opened inside the click (a browser blocks a window opened later), the address comes a moment after
    const tab = window.open('', '_blank')
    setBusy(true)
    try {
      const r = await startTelegramLogin()
      if (tab) tab.location.href = r.url
      else window.location.href = r.url
      setWaiting({ url: r.url, secret: r.secret, until: Date.now() + r.expiresInSeconds * 1000 })
    } catch {
      tab?.close()
      onError(t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  if (waiting) {
    return (
      <div className={cn('rounded-xl border border-[#2AABEE]/40 bg-[#2AABEE]/10 p-4 text-sm', className)} role="status">
        <p className="flex items-center gap-2 font-semibold"><Loader2 className="size-4 animate-spin text-[#229ED9]" />{t('telegramLogin.waiting')}</p>
        <p className="mt-1 text-muted-foreground">{t('telegramLogin.waitingText')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={waiting.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-[#2AABEE] px-3 py-2 font-semibold text-white hover:bg-[#229ED9]"><TelegramIcon className="size-4" />{t('telegramLogin.openAgain')}</a>
          <button type="button" onClick={() => setWaiting(null)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 font-semibold text-muted-foreground hover:text-foreground"><X className="size-4" />{t('common.cancel')}</button>
        </div>
      </div>
    )
  }
  return (
    <button type="button" onClick={start} disabled={busy} className={cn(button, className)}>
      {busy ? <Loader2 className="size-5 animate-spin" /> : <TelegramIcon className="size-5" />}{t('telegramLogin.signIn')}
    </button>
  )
}

// "Sign up in Telegram": the bot asks for the name, the phone (one tap) and the email
export function TelegramSignUpLink({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { data } = useAsync(getTelegramConfig)
  if (!data?.enabled || !data.username) return null
  return (
    <a href={`https://t.me/${data.username}?start=register`} target="_blank" rel="noreferrer" className={cn(button, className)}>
      <TelegramIcon className="size-5" />{t('telegramLogin.signUp')}
    </a>
  )
}
