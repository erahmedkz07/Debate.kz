import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import type { TournamentStatus } from '@/types'

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap', {
  variants: {
    variant: {
      primary: 'bg-primary-soft text-primary',
      accent: 'bg-accent text-accent-foreground',
      muted: 'bg-muted text-muted-foreground',
      success: 'bg-success-soft text-success',
      danger: 'bg-danger-soft text-danger',
      outline: 'border border-border text-muted-foreground',
      glass: 'bg-white/90 text-navy backdrop-blur',
    },
  },
  defaultVariants: { variant: 'primary' },
})

export function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export const statusVariant: Record<TournamentStatus, 'success' | 'accent' | 'muted'> = {
  registration: 'success',
  ongoing: 'accent',
  finished: 'muted',
}

export function StatusDot({ status }: { status: TournamentStatus }) {
  if (status === 'ongoing') {
    return (
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-danger" />
      </span>
    )
  }
  return <span className={cn('size-2 rounded-full', status === 'registration' ? 'bg-success' : 'bg-muted-foreground/60')} />
}
