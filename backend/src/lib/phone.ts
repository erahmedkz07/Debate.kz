import { z } from 'zod'

// A Kazakhstan mobile number in whatever way people write it: "+7 701 555 12 34", "8 701 555 12 34",
// "87015551234", "+7 (701) 555-12-34". Kept in one way, "+7 701 555 12 34", so organizers read every number alike.
export function kzPhone(raw: string) {
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`
  if (d.length !== 11 || !d.startsWith('77') || /[^\d\s()+-]/.test(raw.trim())) return null
  return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`
}

export const phoneField = z.string().max(40).transform((s, ctx) => {
  const p = kzPhone(s)
  if (!p) { ctx.addIssue({ code: 'custom', message: 'phone' }); return z.NEVER }
  return p
})
