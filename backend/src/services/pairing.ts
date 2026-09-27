// Pairing teams into debates. Pure functions, so the rules are easy to test and reason about.
//
// Methods (how the ideal opponent is chosen):
//   power    — neighbours in the standings meet (1–2, 3–4 …): strong vs strong. Round 1 has no standings: random order.
//   high_low — the top meets the bottom (1–N, 2–N-1 …): a gentle start for weaker teams, like seeding in cups.
//   random   — a random order, neighbours meet.
//
// Hard wishes, in this order of importance:
//   1) no rematch (two teams that already met);
//   2) in protected rounds, no two teams of the same club (like the Champions League group draw);
// The search tries the ideal opponents first and backtracks when a choice blocks the rest. If a clean draw
// does not exist (e.g. one club has more than half of the teams), the rule is relaxed step by step and the
// report says how many same-club meetings or rematches were unavoidable.

export type DrawMethod = 'power' | 'high_low' | 'random'

export interface PairingInput {
  order: string[] // teams in ranking order (random order for round 1 or the random method)
  method: DrawMethod
  met: Set<string> // "a|b" (sorted) for every earlier meeting
  clubOf: Map<string, string | null> // team -> club (or institution) id
  protectClubs: boolean
}

export interface PairingResult { pairs: [string, string][]; sameClub: number; rematches: number }

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
const STEP_LIMIT = 50_000

export function shuffle<T>(xs: T[], random = Math.random) {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function pairTeams(input: PairingInput): PairingResult {
  const { order, method, met, clubOf } = input
  const sameClub = (a: string, b: string) => !!clubOf.get(a) && clubOf.get(a) === clubOf.get(b)

  // levels of strictness: 0 = no rematch + no same club, 1 = no rematch, 2 = anything
  const allowed = (a: string, b: string, level: number) => {
    if (level >= 2) return true
    if (met.has(key(a, b))) return false
    if (level === 0 && input.protectClubs && sameClub(a, b)) return false
    return true
  }

  for (let level = 0; level <= 2; level++) {
    let steps = 0
    const pairs: [string, string][] = []
    const used = new Set<string>()
    const solve = (): boolean => {
      if (++steps > STEP_LIMIT) return false
      const a = order.find(x => !used.has(x))
      if (!a) return true
      used.add(a)
      const rest = order.filter(x => !used.has(x))
      // ideal opponents first: the next team (power/random) or the lowest-ranked one left (high_low)
      const candidates = method === 'high_low' ? [...rest].reverse() : rest
      for (const b of candidates) {
        if (!allowed(a, b, level)) continue
        used.add(b)
        pairs.push([a, b])
        if (solve()) return true
        pairs.pop()
        used.delete(b)
      }
      used.delete(a)
      return false
    }
    if (solve()) {
      return {
        pairs,
        sameClub: input.protectClubs ? pairs.filter(([a, b]) => sameClub(a, b)).length : 0,
        rematches: pairs.filter(([a, b]) => met.has(key(a, b))).length,
      }
    }
  }
  // unreachable: level 2 accepts any pairing
  throw new Error('pairing failed')
}
