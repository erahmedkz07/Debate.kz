import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

const overlay = 'fixed inset-0 z-50 bg-navy/50 backdrop-blur-sm data-[state=open]:animate-[fade-in_150ms]'

export function DialogContent({ className, children, heading, description, ...props }: Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> & { heading: ReactNode; description?: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlay} />
      <DialogPrimitive.Content
        className={cn('fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl data-[state=open]:animate-[pop-in_200ms_ease-out]', className)}
        {...props}
      >
        <DialogPrimitive.Title className="pr-8 text-xl font-bold">{heading}</DialogPrimitive.Title>
        <DialogPrimitive.Description className={description ? 'mt-1.5 text-sm text-muted-foreground' : 'sr-only'}>
          {description ?? heading}
        </DialogPrimitive.Description>
        <div className="mt-5">{children}</div>
        <DialogPrimitive.Close className="absolute right-4 top-4 cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
          <X className="size-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

// Side panel built on the same primitive (mobile menu, filters)
export function SheetContent({ className, children, heading, side = 'right', ...props }: Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> & { heading: ReactNode; side?: 'left' | 'right' }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlay} />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 z-50 flex w-[85%] max-w-sm flex-col bg-card shadow-2xl',
          side === 'right' ? 'right-0 data-[state=open]:animate-[slide-in-right_250ms_ease-out]' : 'left-0 data-[state=open]:animate-[slide-in-left_250ms_ease-out]',
          className,
        )}
        {...props}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <DialogPrimitive.Title className="text-lg font-bold">{heading}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{heading}</DialogPrimitive.Description>
          <DialogPrimitive.Close className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="size-5" />
          </DialogPrimitive.Close>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
