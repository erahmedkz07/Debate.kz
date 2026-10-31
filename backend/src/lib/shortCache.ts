// A cache of a few seconds for public pages computed from the database (a tournament, its table, its bracket): when
// a whole hall opens the same page after a round, the work is done once. Visitors who ask while it is being computed
// wait for that same computation instead of starting their own. Failures are not kept. Off in tests (the e2e checks
// read right after a change). The load test (npm run load-test) shows why: without it one tournament's pages took
// the whole processor at 200 visitors.
const off = process.env.NODE_ENV === 'test'

export function shortCache<T>(ttlMs: number) {
  const entries = new Map<string, { at: number; value: Promise<T> }>()
  return (key: string, make: () => Promise<T>): Promise<T> => {
    if (off) return make()
    const hit = entries.get(key)
    if (hit && Date.now() - hit.at < ttlMs) return hit.value
    if (entries.size > 500) entries.clear() // a bounded memory: only what is being watched now
    const value = make()
    entries.set(key, { at: Date.now(), value })
    value.catch(() => { if (entries.get(key)?.value === value) entries.delete(key) })
    return value
  }
}
