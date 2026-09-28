import { cn, initials } from '@/lib/utils'

// The picture of a club or a team wherever it appears. Without an uploaded logo the initials sit on a colour
// picked from the name, so every club and team keeps the same look everywhere.
const TONES = [
  'bg-primary text-primary-foreground', 'bg-navy text-white', 'bg-accent text-navy',
  'bg-success text-white', 'bg-primary-soft text-primary', 'bg-accent-soft text-navy dark:text-accent',
]
const toneOf = (name: string) => TONES[[...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % TONES.length]

const SIZES = {
  xs: 'size-6 rounded-md text-[10px]',
  sm: 'size-9 rounded-lg text-xs',
  md: 'size-11 rounded-xl text-sm',
  lg: 'size-16 rounded-2xl text-lg',
  xl: 'size-20 rounded-2xl text-xl',
} as const

export function EntityLogo({ src, name, size = 'md', className }: { src?: string; name: string; size?: keyof typeof SIZES; className?: string }) {
  if (src) {
    return <img src={src} alt="" loading="lazy" className={cn('shrink-0 border border-border bg-white object-contain', SIZES[size], className)} />
  }
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center font-extrabold', SIZES[size], toneOf(name), className)}>
      {initials(name)}
    </span>
  )
}
