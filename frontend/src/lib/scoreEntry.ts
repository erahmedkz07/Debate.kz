// Typing a score on a ballot. Only what can still become a valid score is accepted: with 60–80 by 0.5 the keys "9",
// "85" or a third digit after "75" do nothing (a slip of the finger never lands on the sheet). A comma counts as a
// point. When the score cannot get longer ("80", "75.5") the ballot moves on to the next speaker at once; when it
// still could ("75" → "75.5") it moves on after a short pause.
export type ScoreRange = { min: number; max: number; step: number }

const format = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10))

export function validScores(r: ScoreRange): string[] {
  const out: string[] = []
  for (let v = r.min; v <= r.max + 1e-9; v += r.step) out.push(format(Math.round(v * 10) / 10))
  return out
}

// the text after a keystroke if it is accepted, else null (the keystroke is ignored)
export function acceptScore(next: string, r: ScoreRange): string | null {
  const s = next.replace(',', '.').trim()
  if (s === '') return ''
  return validScores(r).some(v => v.startsWith(s)) ? s : null
}

// 'done': a valid score that cannot get longer; 'maybe': valid but could go on (75 → 75.5); 'no': not a score yet
export function scoreState(s: string, r: ScoreRange): 'done' | 'maybe' | 'no' {
  const all = validScores(r)
  if (!all.includes(s)) return 'no'
  return all.some(v => v !== s && v.startsWith(s)) ? 'maybe' : 'done'
}

// the next score field of the ballot (in the page's order), or null at the last one
export function focusNextScore(from: HTMLInputElement) {
  const fields = [...document.querySelectorAll<HTMLInputElement>('input[data-score]')]
  const next = fields[fields.indexOf(from) + 1]
  if (!next) return false
  next.focus({ preventScroll: true })
  next.select()
  // on a phone the sticky totals (top) and the send bar (bottom) cover part of the screen, and the on-screen keyboard
  // covers more: a field outside the free middle part is brought to the middle
  const height = window.visualViewport?.height ?? window.innerHeight
  const r = next.getBoundingClientRect()
  if (r.top < 140 || r.bottom > height - 120) next.scrollIntoView({ block: 'center' })
  return true
}
