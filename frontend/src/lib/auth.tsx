import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Role, User } from '@/types'
import { getMe, logout } from '@/api'
import { isRetryable } from '@/lib/ballotOutbox'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import { SESSION_EXPIRED } from '@/api/http'

// The session is an httpOnly cookie set by the API; the page only keeps the user object in memory.
// Offline (API unreachable) the last known user is restored from a minimal local copy, so a judge at a venue
// without Wi-Fi is not thrown to the login page and can still fill and queue a ballot. The API still checks the
// cookie on every request; the copy only decides what the page shows.

export const roleHome: Record<Role, string> = {
  user: '/me',
  admin: '/admin',
}

// After signing in, "next" (the page the previous visitor was on) is followed only if this account may open it:
// someone who logs in after an admin must not land on the admin panel and see "no access".
export function canOpen(u: User, path: string) {
  const p = path.split(/[?#]/)[0]
  const staff = u.role === 'admin'
  if (p === '/admin' || p.startsWith('/admin/')) return staff
  if (p.startsWith('/safety/reports')) return staff || !!u.safeguardingOfficer
  if (/^\/dashboard\/tournaments\/(?!new\b)/.test(p)) return staff || !!u.organizes
  if (p === '/judge' || p.startsWith('/ballot/')) return staff || !!u.judges
  return !['/login', '/register', '/forgot-password', '/reset-password'].includes(p)
}
export const landingFor = (u: User, next: string | null) => (next && canOpen(u, next) ? next : roleHome[u.role])

interface AuthState {
  user: User | null
  ready: boolean // true once /auth/me has answered
  loggedOut: boolean // the user pressed "log out" (not an expired session): guards go home, not to /login?next=
  signIn: (user: User) => void
  signOut: () => Promise<void>
  hasRole: (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

const KEY = 'auth-user-v1'
// only what the page needs to route; no phone or other contacts on the device
const remember = (u: User | null) => {
  try {
    if (!u) return localStorage.removeItem(KEY)
    const { id, name, email, role, createdAt, emailVerified, organizes, judges, safeguardingOfficer } = u
    localStorage.setItem(KEY, JSON.stringify({ id, name, email, role, createdAt, emailVerified, organizes, judges, safeguardingOfficer }))
  } catch {
    // storage blocked: offline restore is simply unavailable
  }
}
const recall = (): User | null => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [loggedOut, setLoggedOut] = useState(false)
  // read by the session-expired listener without re-subscribing on every change
  const signedIn = useRef(false)
  useEffect(() => { signedIn.current = !!user }, [user])

  const load = useCallback(() => getMe()
    // the same profile keeps the same object, so forms and effects that depend on the user are not reset
    .then(u => { setUser(prev => (prev && JSON.stringify(prev) === JSON.stringify(u) ? prev : u)); remember(u) })
    .catch(e => setUser(isRetryable(e) ? recall() : null))
    .finally(() => setReady(true)), [])

  useEffect(() => {
    void load()
    // back online: replace the offline copy with the real profile (or learn that the session has expired)
    const up = () => void load()
    // back to the tab: rights given or taken by an admin meanwhile (officer, organizer) show up without a reload
    const seen = () => { if (document.visibilityState === 'visible' && navigator.onLine) void load() }
    // a request answered 401: the session is over; the guard sends the person to log in and back here afterwards
    const expired = () => {
      if (!signedIn.current) return
      toast.info(i18n.t('auth.sessionExpired'))
      remember(null)
      setUser(null)
    }
    window.addEventListener('online', up)
    document.addEventListener('visibilitychange', seen)
    window.addEventListener(SESSION_EXPIRED, expired)
    return () => {
      window.removeEventListener('online', up); document.removeEventListener('visibilitychange', seen); window.removeEventListener(SESSION_EXPIRED, expired)
    }
  }, [load])

  const signIn = useCallback((u: User) => { setLoggedOut(false); setUser(u); remember(u) }, [])
  const signOut = useCallback(async () => {
    await logout().catch(() => undefined)
    setLoggedOut(true)
    setUser(null)
    remember(null)
  }, [])
  const hasRole = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user])

  const value = useMemo(() => ({ user, ready, loggedOut, signIn, signOut, hasRole }), [user, ready, loggedOut, signIn, signOut, hasRole])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
