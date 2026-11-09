import { useEffect, useState, type InputHTMLAttributes } from 'react'
import { Input } from '@/components/ui/input'

// A whole number typed freely: going from "16" to "24" passes through "1" and "" (out of range), so only a number
// inside the range is passed on; leaving the field with anything else brings the last good number back.
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'type'> & {
  min: number; max: number; value: number; onChange: (n: number) => void
  plain?: boolean // a bare input styled by the caller (the timer), else the site's usual field
}

export function NumberField({ min, max, value, onChange, onBlur, plain, ...rest }: Props) {
  const Field = plain ? 'input' : Input
  const [text, setText] = useState(String(value))
  // a change from outside (a preset button, a clamp) shows at once; the number being typed is left alone
  useEffect(() => { setText(t => (Number(t) === value ? t : String(value))) }, [value])
  return (
    <Field {...rest} type="text" inputMode="numeric" autoComplete="off" value={text}
      onChange={e => {
        const v = e.target.value.replace(/\D/g, '').slice(0, String(max).length)
        setText(v)
        const n = Number(v)
        if (v !== '' && n >= min && n <= max) onChange(n)
      }}
      onBlur={e => { setText(String(value)); onBlur?.(e) }} />
  )
}
