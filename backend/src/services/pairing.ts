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

  const isRematch = (a: string, b: string) => met.has(key(a, b))
  // ideal opponents first: the next team (power/random) or the lowest-ranked one left (high_low)
  const candidatesFor = (rest: string[]) => (method === 'high_low' ? [...rest].reverse() : rest)
  const report = (pairs: [string, string][]): PairingResult => ({
    pairs,
    sameClub: input.protectClubs ? pairs.filter(([a, b]) => sameClub(a, b)).length : 0,
    rematches: pairs.filter(([a, b]) => isRematch(a, b)).length,
  })

  // 1) a clean draw: no rematch and (when protected) no clubmates
  {
    let steps = 0
    const pairs: [string, string][] = []
    const used = new Set<string>()
    const clean = (a: string, b: string) => !isRematch(a, b) && !(input.protectClubs && sameClub(a, b))
    const solve = (): boolean => {
      if (++steps > STEP_LIMIT) return false
      const a = order.find(x => !used.has(x))
      if (!a) return true
      used.add(a)
      for (const b of candidatesFor(order.filter(x => !used.has(x)))) {
        if (!clean(a, b)) continue
        used.add(b); pairs.push([a, b])
        if (solve()) return true
        pairs.pop(); used.delete(b)
      }
      used.delete(a)
      return false
    }
    if (solve()) return report(pairs)
  }

  // 2) no clean draw exists: the fewest rematches, then the fewest clubmate meetings (branch and bound).
  //    A rematch weighs more than any number of clubmate meetings.
  const cost = (a: string, b: string) => (isRematch(a, b) ? 1000 : 0) + (input.protectClubs && sameClub(a, b) ? 1 : 0)
  // lower bound for clubmates: a club with k of n teams has at least k - n/2 internal debates
  const clubSizes = new Map<string, number>()
  for (const x of order) { const c = clubOf.get(x); if (c) clubSizes.set(c, (clubSizes.get(c) ?? 0) + 1) }
  const lowerBound = input.protectClubs ? Math.max(0, ...[...clubSizes.values()].map(k => k - order.length / 2)) : 0
  let best: [string, string][] | null = null
  let bestCost = Infinity
  let steps = 0
  const pairs: [string, string][] = []
  const used = new Set<string>()
  const search = (acc: number) => {
    if (++steps > STEP_LIMIT || acc >= bestCost || bestCost <= lowerBound) return
    const a = order.find(x => !used.has(x))
    if (!a) { best = [...pairs]; bestCost = acc; return }
    used.add(a)
    // cheapest opponents first, the ideal order kept among equals
    const options = candidatesFor(order.filter(x => !used.has(x))).map((b, i) => ({ b, c: cost(a, b), i })).sort((x, y) => x.c - y.c || x.i - y.i)
    for (const { b, c } of options) {
      used.add(b); pairs.push([a, b])
      search(acc + c)
      pairs.pop(); used.delete(b)
    }
    used.delete(a)
  }
  search(0)
  if (best) return report(best)
  // unreachable: level 2 accepts any pairing
  throw new Error('pairing failed')
}
