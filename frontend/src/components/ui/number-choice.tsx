import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

const OTHER = 'other'

// A number picked from the usual values, or typed in ("Other…") within [min, max]: the common choices stay one click
// away, and an organizer with a different tournament is not limited by them.
export function NumberChoice({ id, value, onChange, presets, min, max, size, className, invalid, 'aria-label': ariaLabel }: {
  id?: string; value: number; onChange: (n: number) => void; presets: number[]; min: number; max: number
  size?: 'sm'; className?: string; invalid?: boolean; 'aria-label'?: string
}) {
  const { t } = useTranslation()
  const [custom, setCustom] = useState(!presets.includes(value))
  const [text, setText] = useState(String(value))
  const pick = (v: string) => {
    if (v === OTHER) { setCustom(true); setText(String(value)); return }
    setCustom(false)
    onChange(Number(v))
  }
  const type = (s: string) => {
    setText(s)
    const n = Number(s)
    if (Number.isInteger(n) && n >= min && n <= max) onChange(n)
  }
  const n = Number(text)
  const bad = custom && !(Number.isInteger(n) && n >= min && n <= max)
  return (
    <div className={className}>
      <Select id={id} size={size} value={custom ? OTHER : String(value)} onValueChange={pick} aria-label={ariaLabel} invalid={invalid || bad}
        options={[...presets.map(p => ({ value: String(p), label: String(p) })), { value: OTHER, label: t('common.otherNumber') }]} />
      {custom && (
        <>
          <Input className="mt-2" type="number" inputMode="numeric" min={min} max={max} value={text} autoFocus
            onChange={e => type(e.target.value)} aria-label={ariaLabel} aria-invalid={bad} />
          {bad && <p className="mt-1 text-xs text-danger">{t('common.numberRange', { min, max })}</p>}
        </>
      )}
    </div>
  )
}
