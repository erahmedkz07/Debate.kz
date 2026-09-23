import * as S from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
  hint?: string
}

interface Props {
  value?: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  id?: string
  disabled?: boolean
  invalid?: boolean
  size?: 'sm' | 'md'
  className?: string
  'aria-label'?: string
}

// Styled dropdown (Radix Select): keyboard + screen reader friendly, matches the brand look
export function Select({ value, onValueChange, options, placeholder, id, disabled, invalid, size = 'md', className, ...aria }: Props) {
  return (
    <S.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <S.Trigger
        id={id}
        aria-label={aria['aria-label']}
        aria-invalid={invalid}
        className={cn(
          'group flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl border-2 border-border bg-card px-3.5 text-left text-foreground transition-colors',
          'hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 data-[state=open]:border-primary data-[state=open]:ring-4 data-[state=open]:ring-primary/15',
          'disabled:cursor-not-allowed disabled:opacity-60 data-[placeholder]:text-muted-foreground/70 aria-[invalid=true]:border-danger',
          size === 'sm' ? 'h-9 text-xs font-semibold' : 'h-11 text-sm',
          className,
        )}
      >
        <span className="truncate"><S.Value placeholder={placeholder} /></span>
        <S.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          className="z-[60] max-h-[min(var(--radix-select-content-available-height),20rem)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-xl shadow-navy/10 data-[state=open]:animate-[dropdown-in_150ms_ease-out]"
        >
          <S.Viewport>
            {options.map(o => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-xl py-2.5 pl-3 pr-9 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary data-[state=checked]:font-bold data-[state=checked]:text-primary data-[disabled]:opacity-50"
              >
                <S.ItemText>{o.label}</S.ItemText>
                {o.hint && <span className="ml-auto text-xs text-muted-foreground">{o.hint}</span>}
                <S.ItemIndicator className="absolute right-3">
                  <Check className="size-4" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  )
}
