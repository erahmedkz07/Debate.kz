import { cloneElement, forwardRef, isValidElement, type HTMLAttributes, type ReactElement } from 'react'
import { cn } from '@/lib/utils'

// Minimal Slot: merges props/className into the single child (for <Button asChild><Link/></Button>)
export const Slot = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(({ children, className, ...props }, ref) => {
  if (!isValidElement(children)) return null
  const child = children as ReactElement<HTMLAttributes<HTMLElement> & { ref?: unknown }>
  return cloneElement(child, { ...props, ...child.props, ref, className: cn(className, child.props.className) } as never)
})
Slot.displayName = 'Slot'
