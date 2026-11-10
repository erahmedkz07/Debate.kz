// A Kazakhstan mobile number in whatever way people write it: "+7 701 555 12 34", "8 701 555 12 34",
// "87015551234", "+7 (701) 555-12-34" (the server keeps it as "+7 701 555 12 34"). The same rule as backend/lib/phone.ts.
export function isKzPhone(raw: string) {
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`
  return d.length === 11 && d.startsWith('77') && !/[^\d\s()+-]/.test(raw.trim())
}
