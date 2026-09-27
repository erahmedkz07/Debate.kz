import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Role, User } from '@/types'
import { getMe, logout } from '@/api'
import { isRetryable } from '@/lib/ballotOutbox'

// The session is an httpOnly cookie set by the API; the page only keeps the user object in memory.
// Offline (API unreachable) the last known user is restored from a minimal local copy, so a judge at a venue
// without Wi-Fi is not thrown to the login page and can still fill and queue a ballot. The API still checks the
// cookie on every request; the copy only decides what the page shows.

export const roleHome: Record<Role, string> = {
  user: '/me',
  admin: '/admin',
}

interface AuthState {
  user: User | null
  ready: boolean // true once /auth/me has answered
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

  const load = useCallback(() => getMe()
    .then(u => { setUser(u); remember(u) })
    .catch(e => setUser(isRetryable(e) ? recall() : null))
    .finally(() => setReady(true)), [])

  useEffect(() => {
    void load()
    // back online: replace the offline copy with the real profile (or learn that the session has expired)
    const up = () => void load()
    window.addEventListener('online', up)
    return () => window.removeEventListener('online', up)
  }, [load])

  const signIn = useCallback((u: User) => { setUser(u); remember(u) }, [])
  const signOut = useCallback(async () => {
    await logout().catch(() => undefined)
    setUser(null)
    remember(null)
  }, [])
  const hasRole = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user])

  const value = useMemo(() => ({ user, ready, signIn, signOut, hasRole }), [user, ready, signIn, signOut, hasRole])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
