import type { ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LockKeyhole, LogIn, ShieldAlert, UserPlus } from 'lucide-react'
import type { Role } from '@/types'
import { useAuth } from '@/lib/auth'
import { roleHome } from '@/mocks/users'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'

export const loginUrl = (next: string) => `/login?next=${encodeURIComponent(next)}`

// Route guard: guests go to /login?next=..., wrong role sees a friendly 403
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to={loginUrl(location.pathname + location.search)} replace />
  if (roles && !roles.includes(user.role)) return <Forbidden />
  return <>{children}</>
}

export function Forbidden() {
  const { t } = useTranslation()
  const { user } = useAuth()
  return (
    <section className="container-page grid min-h-[70vh] place-items-center py-16 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-20 place-items-center rounded-3xl bg-accent-soft text-navy dark:text-accent"><ShieldAlert className="size-10" /></span>
        <h1 className="mt-6 text-3xl font-extrabold">{t('authGate.forbiddenTitle')}</h1>
        <p className="mt-3 text-muted-foreground">{t('authGate.forbiddenText', { role: user ? t(`roles.${user.role}`) : '' })}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {user && <Button asChild><Link to={roleHome[user.role]}>{t('authGate.toCabinet')}</Link></Button>}
          <Button asChild variant="outline"><Link to="/">{t('notFound.home')}</Link></Button>
        </div>
      </div>
    </section>
  )
}

// Dialog shown when a guest presses an action that needs an account
export function LoginRequiredDialog({ open, onOpenChange, text }: { open: boolean; onOpenChange: (v: boolean) => void; text?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const next = encodeURIComponent(location.pathname + location.search)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent heading={t('authGate.title')} className="max-w-md text-center">
        <span className="mx-auto -mt-2 mb-4 grid size-16 place-items-center rounded-2xl bg-primary-soft text-primary"><LockKeyhole className="size-8" /></span>
        <p className="text-muted-foreground">{text ?? t('authGate.text')}</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button onClick={() => navigate(`/login?next=${next}`)}><LogIn className="size-4" />{t('nav.login')}</Button>
          <Button variant="outline" onClick={() => navigate(`/register?next=${next}`)}><UserPlus className="size-4" />{t('auth.toRegister')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
