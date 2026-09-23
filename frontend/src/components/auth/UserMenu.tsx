import * as M from '@radix-ui/react-dropdown-menu'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ChevronDown, ClipboardList, Gavel, LayoutGrid, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import type { Role } from '@/types'
import { useAuth } from '@/lib/auth'
import { cn, initials } from '@/lib/utils'

const avatarColor: Record<Role, string> = {
  participant: 'bg-primary text-primary-foreground',
  organizer: 'bg-accent text-navy',
  judge: 'bg-navy text-white dark:bg-primary-soft dark:text-primary',
  admin: 'bg-danger text-white',
}

// Cabinet links available for each role
export function cabinetLinks(role: Role) {
  const links = [{ to: '/me', key: 'profile', icon: UserRound }]
  if (role === 'organizer' || role === 'admin') links.unshift({ to: '/dashboard', key: 'organizer', icon: LayoutGrid })
  if (role === 'judge' || role === 'admin') links.unshift({ to: '/judge', key: 'judge', icon: Gavel })
  if (role === 'admin') links.unshift({ to: '/admin', key: 'admin', icon: ShieldCheck })
  return links
}

export function Avatar({ name, role, className }: { name: string; role: Role; className?: string }) {
  return <span className={cn('grid size-9 shrink-0 place-items-center rounded-full text-sm font-extrabold', avatarColor[role], className)}>{initials(name)}</span>
}

export function UserMenu({ onDark }: { onDark?: boolean }) {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  const logout = () => {
    signOut()
    toast(t('authGate.loggedOut'))
    navigate('/')
  }

  return (
    <M.Root>
      <M.Trigger className={cn('flex cursor-pointer items-center gap-2 rounded-full p-1 pr-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        onDark ? 'hover:bg-white/10' : 'hover:bg-muted')} aria-label={user.name}>
        <Avatar name={user.name} role={user.role} />
        <ChevronDown className={cn('size-4', onDark ? 'text-white' : 'text-muted-foreground')} />
      </M.Trigger>
      <M.Portal>
        <M.Content align="end" sideOffset={8}
          className="z-[60] w-64 rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-xl shadow-navy/10 data-[state=open]:animate-[dropdown-in_150ms_ease-out]">
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar name={user.name} role={user.role} className="size-11" />
            <div className="min-w-0">
              <p className="truncate font-bold">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              <span className="mt-1 inline-block rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">{t(`roles.${user.role}`)}</span>
            </div>
          </div>
          <M.Separator className="my-1 h-px bg-border" />
          {cabinetLinks(user.role).map(({ to, key, icon: Icon }) => (
            <M.Item key={to} asChild>
              <Link to={to} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium outline-none data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary">
                <Icon className="size-4" />{t(`cabinet.${key}`)}
              </Link>
            </M.Item>
          ))}
          {user.role === 'participant' && (
            <M.Item asChild>
              <Link to="/tournaments" className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium outline-none data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary">
                <ClipboardList className="size-4" />{t('home.audience.partCta')}
              </Link>
            </M.Item>
          )}
          <M.Separator className="my-1 h-px bg-border" />
          <M.Item onSelect={logout}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-danger outline-none data-[highlighted]:bg-danger-soft">
            <LogOut className="size-4" />{t('authGate.logout')}
          </M.Item>
        </M.Content>
      </M.Portal>
    </M.Root>
  )
}
