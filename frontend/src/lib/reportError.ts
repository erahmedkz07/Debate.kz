// A crash on the visitor's page is told to the server (and from there to the admins), so a broken screen is
// known before anyone complains. At most a few reports per page load; no personal data, the path without its query.
let sent = 0
export function reportError(error: unknown) {
  if (sent >= 5 || import.meta.env.MODE === 'test') return
  sent++
  const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error))
  const body = JSON.stringify({ message: e.message.slice(0, 500) || 'unknown error', stack: e.stack?.slice(0, 4000), path: window.location.pathname })
  try {
    if (!navigator.sendBeacon?.('/api/client-errors', new Blob([body], { type: 'application/json' }))) {
      void fetch('/api/client-errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined)
    }
  } catch { /* reporting must never break the page */ }
}

// errors nobody caught: a failed script, a promise without a handler
export function watchErrors() {
  window.addEventListener('error', ev => reportError(ev.error ?? ev.message))
  window.addEventListener('unhandledrejection', ev => reportError(ev.reason))
}
