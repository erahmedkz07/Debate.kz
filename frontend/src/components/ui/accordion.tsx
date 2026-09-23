import * as A from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'

export function Accordion({ items }: { items: { q: string; a: string }[] }) {
  return (
    <A.Root type="single" collapsible className="space-y-3">
      {items.map((it, i) => (
        <A.Item key={i} value={`i${i}`} className="overflow-hidden rounded-2xl border border-border bg-card">
          <A.Header>
            <A.Trigger className="group flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left font-semibold hover:text-primary">
              {it.q}
              <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </A.Trigger>
          </A.Header>
          <A.Content className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{it.a}</A.Content>
        </A.Item>
      ))}
    </A.Root>
  )
}
