import type { Round } from '@/types'

// Closed rounds (mirrors backend services/silent.ts): a preliminary round the organizer closed keeps its results
// hidden from the public until the break is announced, the tournament finishes, or the round is opened again.
export function silentRoundIds(t: { status: string; rounds: Round[] }): Set<string> {
  if (t.status === 'finished' || t.rounds.some(r => r.kind === 'elimination')) return new Set()
  return new Set(t.rounds.filter(r => r.kind !== 'elimination' && r.silent).map(r => r.id))
}
