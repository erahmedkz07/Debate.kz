import type { BracketPart } from '@/api'
import type { PlayoffStage } from '@/types'

// Final places of one bracket (the open break, a league's or a category's) once all its rounds are completed:
// the final gives 1st and 2nd (BP: 1st–4th), the teams out in an earlier stage share the next places (3–4, 5–8…),
// then every team that did not break, in the order of the preliminary table. null while the playoffs go on.
export interface FinalPlace { teamId: string; place: string; stage: PlayoffStage | 'champion' | 'finalist' | 'prelims' }

export function finalPlaces(part: BracketPart | undefined, prelimOrder: string[]): FinalPlace[] | null {
  if (!part?.rounds.length || part.rounds.some(r => r.status !== 'completed')) return null
  const out: FinalPlace[] = []
  const placed = new Set<string>()
  const rank = new Map(prelimOrder.map((id, i) => [id, i]))
  const byTable = (a: string, b: string) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9)
  // the latest round first: the final, then the stages before it
  for (let k = part.rounds.length - 1; k >= 0; k--) {
    const r = part.rounds[k]
    const final = r === part.rounds.at(-1)
    const out1: string[] = []
    for (const d of r.debates) {
      const team = (side: string) => d.teams.find(x => x.side === side)?.teamId
      if (d.ranking?.length) {
        // BP: the final room ranks all four; an earlier room sends its 3rd and 4th out
        const order = d.ranking.map(team).filter((x): x is string => !!x)
        if (final) order.forEach((id, i) => { out.push({ teamId: id, place: String(i + 1), stage: i === 0 ? 'champion' : r.stage }); placed.add(id) })
        else out1.push(...order.slice(2))
      } else if (d.winner) {
        const win = team(d.winner)
        const lose = d.teams.find(x => x.side !== d.winner)?.teamId
        if (final) {
          if (win) { out.push({ teamId: win, place: '1', stage: 'champion' }); placed.add(win) }
          if (lose) { out.push({ teamId: lose, place: '2', stage: 'finalist' }); placed.add(lose) }
        } else if (lose) out1.push(lose)
      }
    }
    // the teams out in this stage share their places (5–8), in the order of the preliminary table
    const losers = out1.filter(id => !placed.has(id)).sort(byTable)
    const from = placed.size + 1
    const to = placed.size + losers.length
    for (const id of losers) { out.push({ teamId: id, place: from === to ? String(from) : `${from}–${to}`, stage: r.stage }); placed.add(id) }
  }
  // everyone else: by the preliminary table
  let next = placed.size + 1
  for (const id of prelimOrder) if (!placed.has(id)) { out.push({ teamId: id, place: String(next++), stage: 'prelims' }); placed.add(id) }
  return out
}
