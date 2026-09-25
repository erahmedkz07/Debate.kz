import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Role, User } from '@/types'
import { getMe, logout } from '@/api'

// The session is an httpOnly cookie set by the API; the page only keeps the user object in memory.

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    getMe().then(setUser).catch(() => setUser(null)).finally(() => setReady(true))
  }, [])

  const signIn = useCallback((u: User) => setUser(u), [])
  const signOut = useCallback(async () => {
    await logout().catch(() => undefined)
    setUser(null)
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
