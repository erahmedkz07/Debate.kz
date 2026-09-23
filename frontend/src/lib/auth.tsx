import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Role, User } from '@/types'

// Mock session in localStorage; with the real backend this becomes an httpOnly JWT cookie + /me request
const KEY = 'session'

interface AuthState {
  user: User | null
  signIn: (user: User) => void
  signOut: () => void
  hasRole: (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

const load = (): User | null => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') } catch { return null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(load)

  const signIn = useCallback((u: User) => {
    setUser(u)
    try { localStorage.setItem(KEY, JSON.stringify(u)) } catch { /* private mode */ }
  }, [])

  const signOut = useCallback(() => {
    setUser(null)
    try { localStorage.removeItem(KEY) } catch { /* private mode */ }
  }, [])

  const hasRole = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user])

  const value = useMemo(() => ({ user, signIn, signOut, hasRole }), [user, signIn, signOut, hasRole])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
