import { useEffect, useRef } from 'react'
import { Minus, Plus } from 'lucide-react'
import { acceptScore, focusNextScore, scoreState, type ScoreRange } from '@/lib/scoreEntry'
import { cn } from '@/lib/utils'

// A score field of a ballot (and of the score calculator): only what can still become a valid score is typed, a finished
// score moves on to the next field, Enter moves on, − and + step through the range.
export function ScoreInput({ label, value, onChange, range, invalid }: { label: string; value: string; onChange: (v: string) => void; range: ScoreRange; invalid: boolean }) {
  const pause = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(pause.current), [])
  const bump = (d: number) => {
    // an empty field starts in the middle of the range; the result always lies on the step (25–40 by 1: 33, not 32.5)
    const n = value === '' ? (range.min + range.max) / 2 : Number(value) + d
    const onStep = Math.round(Math.min(range.max, Math.max(range.min, n)) / range.step) * range.step
    onChange(String(Math.round(onStep * 10) / 10))
  }
  // only what can still become a score is typed; a finished score moves on to the next speaker
  const type = (el: HTMLInputElement, raw: string) => {
    const next = acceptScore(raw, range)
    if (next === null) return
    onChange(next)
    window.clearTimeout(pause.current)
    const state = scoreState(next, range)
    if (state === 'done') focusNextScore(el)
    else if (state === 'maybe') pause.current = window.setTimeout(() => { if (document.activeElement === el) focusNextScore(el) }, 900)
  }
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-0 truncate text-sm font-medium">{label}</span>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" tabIndex={-1} onClick={() => bump(-range.step)} className="grid size-10 cursor-pointer place-items-center rounded-lg bg-muted hover:bg-border" aria-label={`${label}: −${range.step}`}><Minus className="size-4" /></button>
        <input
          data-score inputMode="decimal" enterKeyHint="next" autoComplete="off" value={value} aria-label={label} aria-invalid={invalid}
          onChange={e => type(e.currentTarget, e.target.value)}
          onKeyDown={e => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            window.clearTimeout(pause.current)
            // an empty field was reached by the auto-advance: an Enter pressed out of habit after "80" stays here
            // instead of skipping a speaker
            if (e.currentTarget.value !== '') focusNextScore(e.currentTarget)
          }}
          onFocus={e => e.currentTarget.select()}
          placeholder={`${range.min}–${range.max}`}
          className={cn('h-10 w-[4.5rem] rounded-lg border-2 bg-card text-center text-base font-bold tabular-nums focus:outline-none focus:ring-4 focus:ring-primary/15',
            invalid ? 'border-danger' : 'border-border focus:border-primary')}
        />
        <button type="button" tabIndex={-1} onClick={() => bump(range.step)} className="grid size-10 cursor-pointer place-items-center rounded-lg bg-muted hover:bg-border" aria-label={`${label}: +${range.step}`}><Plus className="size-4" /></button>
      </div>
    </div>
  )
}
