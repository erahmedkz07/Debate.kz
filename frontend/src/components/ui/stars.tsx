import { useState } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

// 1..5 stars; interactive when onChange is given (radio group for keyboard and screen readers)
export function StarRating({ value, onChange, label, size = 'md' }: { value: number; onChange?: (v: number) => void; label: string; size?: 'sm' | 'md' }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  const icon = size === 'sm' ? 'size-3.5' : 'size-7'
  if (!onChange) {
    return (
      <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${label}: ${value}/5`}>
        {[1, 2, 3, 4, 5].map(n => <Star key={n} className={cn(icon, n <= value ? 'fill-accent text-accent' : 'text-border')} />)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}/5`}
          onClick={() => onChange(n)} onMouseEnter={() => setHover(n)}
          className="cursor-pointer rounded-md p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Star className={cn(icon, n <= shown ? 'fill-accent text-accent' : 'text-border')} />
        </button>
      ))}
    </span>
  )
}
