import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CloudOff, RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { apiErrorText } from '@/lib/errors'
import { flushBallots, OUTBOX_EVENT, pendingBallots } from '@/lib/ballotOutbox'

const RETRY_MS = 30_000

// Sends ballots queued while offline as soon as the connection returns, and shows a small status pill:
// "offline" while there is no network, "N ballots waiting" while something is queued.
export function OfflineSync() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [online, setOnline] = useState(() => navigator.onLine)
  const [waiting, setWaiting] = useState(0)
  const [busy, setBusy] = useState(false)

  const count = useCallback(() => setWaiting(user ? pendingBallots(user.id).length : 0), [user])

  const flush = useCallback(async (manual = false) => {
    if (!user || !pendingBallots(user.id).length) return
    setBusy(true)
    try {
      const r = await flushBallots(user.id)
      if (r.sent.length) toast.success(t('offline.sent', { count: r.sent.length }))
      for (const { ballot, code } of r.rejected) toast.error(t('offline.rejected', { label: ballot.label, reason: apiErrorText(code, t) }), { duration: 15_000 })
      if (manual && r.waiting) toast.info(t('offline.stillOffline'))
    } finally {
      setBusy(false)
      count()
    }
  }, [user, t, count])

  useEffect(() => {
    count()
    void flush()
    const up = () => { setOnline(true); void flush() }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    window.addEventListener(OUTBOX_EVENT, count)
    // "online" is not always fired (captive portals, a server that was down): retry on a timer too
    const timer = window.setInterval(() => { if (navigator.onLine) void flush() }, RETRY_MS)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
      window.removeEventListener(OUTBOX_EVENT, count)
      window.clearInterval(timer)
    }
  }, [flush, count])

  if (online && !waiting) return null
  return (
    <div role="status" className="fixed bottom-4 left-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold shadow-lg print:hidden">
      <CloudOff className="size-4 shrink-0 text-danger" />
      <span>{!online ? t('offline.offline') : null}{!online && waiting ? ' · ' : null}{waiting ? t('offline.waiting', { count: waiting }) : null}</span>
      {online && waiting > 0 && (
        <button type="button" disabled={busy} onClick={() => void flush(true)} aria-label={t('offline.retry')} title={t('offline.retry')}
          className="-mr-1 grid size-7 cursor-pointer place-items-center rounded-full text-primary hover:bg-primary-soft disabled:opacity-50">
          <RefreshCw className={busy ? 'size-4 animate-spin' : 'size-4'} />
        </button>
      )}
    </div>
  )
}
