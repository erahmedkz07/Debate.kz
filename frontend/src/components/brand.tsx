import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <Link to="/" className={cn('group inline-flex items-center gap-2.5', className)} aria-label="Debate.kz">
      <span className="grid size-10 place-items-center rounded-xl bg-primary shadow-md shadow-primary/30 transition-transform duration-300 group-hover:rotate-[-6deg] group-hover:scale-105">
        <img src="/brand/debate-logo-mark.svg" alt="" className="w-7" />
      </span>
      <span className={cn('text-xl font-extrabold tracking-tight', inverted ? 'text-white' : 'text-foreground')}>
        Debate<span className="text-primary">.kz</span>
      </span>
    </Link>
  )
}

// Decorative ram-horn ornament; color comes from text-* classes
export function Ornament({ className }: { className?: string }) {
  return <span aria-hidden className={cn('ornament pointer-events-none block aspect-[560/308]', className)} />
}

export function OrnamentPattern({ className }: { className?: string }) {
  return <span aria-hidden className={cn('ornament-pattern pointer-events-none absolute inset-0', className)} />
}

export function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M21.94 4.3a1.5 1.5 0 0 0-2.02-1.08L2.9 9.86c-1.2.47-1.18 2.18.03 2.62l4.1 1.5 1.6 5.1a1.2 1.2 0 0 0 1.98.5l2.36-2.28 4.47 3.3c.87.64 2.1.17 2.33-.89l3.17-15.4ZM9.5 14.2l-.6 3.4-1.1-3.7 9.6-6.1-7.9 6.4Z" />
    </svg>
  )
}
