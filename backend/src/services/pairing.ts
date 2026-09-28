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

// ---------- British Parliamentary: rooms of four ----------
//   power    — brackets: the ranking is cut into consecutive groups of four (1–4, 5–8 …)
//   high_low — every room mixes the table: room k gets the k-th team of each quarter
//   random   — a random order cut into groups of four
// BP teams meet each other again and again, so there is no rematch rule. In protected rounds teams of one club are
// spread over the rooms: a clashing team swaps with a team of the nearest room whenever that lowers the clashes.

export interface RoomsResult { rooms: string[][]; sameClub: number }

export function groupRooms(input: Omit<PairingInput, 'met'>): RoomsResult {
  const { order, method, clubOf, protectClubs } = input
  const R = order.length / 4
  const rooms = method === 'high_low'
    ? Array.from({ length: R }, (_, k) => [0, 1, 2, 3].map(q => order[q * R + k]))
    : Array.from({ length: R }, (_, k) => order.slice(k * 4, k * 4 + 4))
  const clashes = (room: string[]) => {
    let c = 0
    for (let i = 0; i < room.length; i++) for (let j = i + 1; j < room.length; j++) {
      const a = clubOf.get(room[i])
      if (a && a === clubOf.get(room[j])) c++
    }
    return c
  }
  if (protectClubs) {
    for (let pass = 0, improved = true; improved && pass < 50; pass++) {
      improved = false
      for (let i = 0; i < R; i++) {
        if (!clashes(rooms[i])) continue
        // the nearest rooms first, so a bracket stays close to its strength
        const others = Array.from({ length: R }, (_, j) => j).filter(j => j !== i).sort((x, y) => Math.abs(x - i) - Math.abs(y - i))
        search: for (let a = 0; a < 4; a++) for (const j of others) for (let b = 0; b < 4; b++) {
          const before = clashes(rooms[i]) + clashes(rooms[j])
          ;[rooms[i][a], rooms[j][b]] = [rooms[j][b], rooms[i][a]]
          if (clashes(rooms[i]) + clashes(rooms[j]) < before) { improved = true; break search }
          ;[rooms[i][a], rooms[j][b]] = [rooms[j][b], rooms[i][a]]
        }
      }
    }
  }
  return { rooms, sameClub: protectClubs ? rooms.reduce((s, r) => s + clashes(r), 0) : 0 }
}

// every order of four positions
const PERMUTATIONS: number[][] = []
const permute = (rest: number[], acc: number[]) => {
  if (!rest.length) { PERMUTATIONS.push(acc); return }
  rest.forEach((x, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x]))
}
permute([0, 1, 2, 3], [])

// BP positions (OG, OO, CG, CO): each team goes where it has been least often.
// counts: team -> how many times it has held each position. Returns the room's teams in position order.
export function assignPositions(room: string[], counts: Map<string, number[]>, random = Math.random): string[] {
  const teams = shuffle(room, random) // equal options stay random
  let best = teams, bestCost = Infinity
  for (const perm of PERMUTATIONS) {
    // squared, so one team repeating a position three times weighs more than three teams repeating once
    const cost = perm.reduce((s, pos, i) => s + ((counts.get(teams[i])?.[pos] ?? 0) + 1) ** 2, 0)
    if (cost < bestCost) {
      bestCost = cost
      best = Array.from({ length: 4 }, (_, pos) => teams[perm.indexOf(pos)])
    }
  }
  return best
}
