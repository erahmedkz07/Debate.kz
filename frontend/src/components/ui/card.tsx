import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// React 19: `ref` is a plain prop, so a Card can be measured or sent full screen
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-2xl border border-border bg-card shadow-sm', className)} {...props} />
}
