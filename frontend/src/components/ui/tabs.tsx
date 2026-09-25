import * as TabsPrimitive from '@radix-ui/react-tabs'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('flex gap-1 overflow-x-auto rounded-2xl bg-muted p-1 [scrollbar-width:none]', className)}
      {...props}
    />
  )
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'shrink-0 cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('mt-6 focus-visible:outline-none', className)} {...props} />
}

// Section navigation for cabinets: a sticky vertical sidebar on laptops (lg+), the usual pill tabs on phones.
// Put it next to the content in a grid like `lg:grid-cols-[15rem_minmax(0,1fr)]`.
export function SideTabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'flex gap-1 overflow-x-auto rounded-2xl bg-muted p-1 [scrollbar-width:none]',
        'lg:sticky lg:top-24 lg:flex-col lg:overflow-visible lg:border lg:border-border lg:bg-card lg:p-2 lg:shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

export function SideTabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'flex shrink-0 cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground transition-all hover:text-foreground',
        'data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm',
        'lg:w-full lg:gap-3 lg:px-3.5 lg:py-2.5 lg:hover:bg-muted lg:data-[state=active]:bg-primary lg:data-[state=active]:text-primary-foreground lg:data-[state=active]:shadow-md lg:data-[state=active]:shadow-primary/20',
        className,
      )}
      {...props}
    />
  )
}
