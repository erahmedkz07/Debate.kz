// Break calculator, as the standard debate tools do it (DebateTab Break Predictor, letusbreak.com, the BP calculators
// on GitHub): from the number of teams, preliminary rounds and the break size it estimates
//   - the guaranteed break: with this many points a team breaks whatever the speaker scores;
//   - the break on speaks: teams on this many points are at the edge, the speaker scores decide which of them break.
//
// The model is the "ideal" power-paired tournament: each round teams are paired with teams on the same score
// (an odd bracket pulls up a team from the bracket below), and inside every debate the stronger team wins.
// Two-team formats (WSDC, APF, Karl Popper): 1 point per win. British Parliamentary: rooms of four, 3/2/1/0 points.
// An odd number of teams (or not a multiple of four in BP) gets stand-in "swing" teams, as at real tournaments;
// they are not counted in the result.

export type CalcFormat = 'two' | 'bp'

export interface BreakInput { teams: number; rounds: number; breakSize: number; format: CalcFormat }

export interface BreakResult {
  // score -> how many teams finish on it (highest score first)
  distribution: { score: number; teams: number; status: 'safe' | 'edge' | 'out' }[]
  safe: number | null // the lowest score that always breaks (null: not even the top score is certain)
  edge: number | null // the score where only some teams break on speaks (null: the line falls exactly between scores)
  edgeTeams: number // teams on the edge score
  edgeBreak: number // how many of them break
  maxScore: number
  swings: number
}

export function calculateBreak({ teams, rounds, breakSize, format }: BreakInput): BreakResult {
  const perRoom = format === 'bp' ? 4 : 2
  const points = format === 'bp' ? [3, 2, 1, 0] : [1, 0]
  const swings = (perRoom - (teams % perRoom)) % perRoom
  // each team: its score and whether it is a real team; teams start in a fixed "strength" order (index = strength)
  let field = [
    ...Array.from({ length: teams }, (_, i) => ({ id: i, score: 0, real: true })),
    ...Array.from({ length: swings }, (_, i) => ({ id: teams + i, score: 0, real: false })),
  ]
  for (let r = 0; r < rounds; r++) {
    // power pairing: by score, then by strength (stand-ins are the weakest); neighbours meet
    field.sort((a, b) => b.score - a.score || Number(b.real) - Number(a.real) || a.id - b.id)
    const next: typeof field = []
    for (let i = 0; i < field.length; i += perRoom) {
      // inside the room the stronger team (smaller id; stand-ins last) takes the higher place
      const room = field.slice(i, i + perRoom).sort((a, b) => Number(b.real) - Number(a.real) || a.id - b.id)
      room.forEach((tm, place) => next.push({ ...tm, score: tm.score + points[place] }))
    }
    field = next
  }
  const real = field.filter(t => t.real)
  const maxScore = rounds * points[0]
  const count = new Map<number, number>()
  for (const t of real) count.set(t.score, (count.get(t.score) ?? 0) + 1)

  // walk down from the top: the scores fully inside the break are safe, the one that crosses the line is the edge
  const size = Math.min(breakSize, real.length)
  let above = 0
  let safe: number | null = null
  let edge: number | null = null
  let edgeTeams = 0
  let edgeBreak = 0
  const distribution: BreakResult['distribution'] = []
  for (let s = maxScore; s >= 0; s--) {
    const n = count.get(s) ?? 0
    if (!n) continue
    let status: 'safe' | 'edge' | 'out'
    if (above + n <= size) {
      status = above + n === size || edge === null ? 'safe' : 'out'
      if (status === 'safe') safe = s
    } else if (above < size) {
      status = 'edge'
      edge = s
      edgeTeams = n
      edgeBreak = size - above
    } else {
      status = 'out'
    }
    distribution.push({ score: s, teams: n, status })
    above += n
  }
  return { distribution, safe, edge, edgeTeams, edgeBreak, maxScore, swings }
}
