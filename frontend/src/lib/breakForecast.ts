// Break forecast from team points only (speaker points break ties, so a tie is never counted as safe).
// Points are wins in two-team formats (1 per round) and team points in BP (up to 3 per round).
//  - safe: even if every rival takes the most points in all remaining rounds, fewer than breakSize teams can reach this team
//  - out:  even taking the most points in every remaining round, at least breakSize teams already have more
//  - live: everything else
export type BreakStatus = 'safe' | 'live' | 'out'

export function breakForecast(rows: { team: { id: string }; points: number }[], breakSize: number, remaining: number, perRound = 1) {
  const status = new Map<string, BreakStatus>()
  const most = remaining * perRound
  for (const r of rows) {
    const others = rows.filter(o => o.team.id !== r.team.id)
    const canCatchUp = others.filter(o => o.points + most >= r.points).length
    const alreadyAhead = others.filter(o => o.points > r.points + most).length
    status.set(r.team.id, alreadyAhead >= breakSize ? 'out' : canCatchUp < breakSize ? 'safe' : 'live')
  }
  // points of the last team inside the break right now (the current cut-off)
  const sorted = [...rows].sort((a, b) => b.points - a.points)
  const line = sorted[Math.min(breakSize, sorted.length) - 1]?.points ?? 0
  return { status, line }
}
