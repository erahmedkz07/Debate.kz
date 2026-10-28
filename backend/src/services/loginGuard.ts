// Guessing passwords (or 2FA codes) of one account from many addresses: the per-address limit cannot see it, so each
// account counts its own failures. After MAX_FAILS within the window the account refuses every attempt (even the
// right password) until the window passes. Kept in memory: one API process; a restart forgets the counts.
const MAX_FAILS = 10
const WINDOW_MS = 15 * 60 * 1000
const fails = new Map<string, number[]>()

const recent = (key: string) => (fails.get(key) ?? []).filter(t => Date.now() - t < WINDOW_MS)

export const isLocked = (key: string) => recent(key).length >= MAX_FAILS

export function noteFailure(key: string) {
  const list = recent(key)
  list.push(Date.now())
  fails.set(key, list)
  // a bounded memory: forget the oldest accounts when too many are counted
  if (fails.size > 50_000) for (const k of [...fails.keys()].slice(0, 10_000)) fails.delete(k)
}

export const clearFailures = (key: string) => { fails.delete(key) }
