// Break forecast from wins only (speaker points break ties, so a tie is never counted as safe).
//  - safe: even if every rival wins all remaining rounds, fewer than breakSize teams can reach this team's current wins
//  - out:  even winning every remaining round, at least breakSize teams already have more wins
//  - live: everything else
export type BreakStatus = 'safe' | 'live' | 'out'

export function breakForecast(rows: { team: { id: string }; wins: number }[], breakSize: number, remaining: number) {
  const status = new Map<string, BreakStatus>()
  for (const r of rows) {
    const others = rows.filter(o => o.team.id !== r.team.id)
    const canCatchUp = others.filter(o => o.wins + remaining >= r.wins).length
    const alreadyAhead = others.filter(o => o.wins > r.wins + remaining).length
    status.set(r.team.id, alreadyAhead >= breakSize ? 'out' : canCatchUp < breakSize ? 'safe' : 'live')
  }
  // wins of the last team inside the break right now (the current cut-off)
  const sorted = [...rows].sort((a, b) => b.wins - a.wins)
  const line = sorted[Math.min(breakSize, sorted.length) - 1]?.wins ?? 0
  return { status, line }
}
