import type { Round } from '@/types'

// Silent rounds (mirrors backend services/silent.ts): the last N preliminary rounds keep their results hidden
// from the public until the break is announced or the tournament finishes.
export function silentRoundIds(t: { silentRounds?: number; status: string; rounds: Round[] }): Set<string> {
  if (!t.silentRounds || t.status === 'finished' || t.rounds.some(r => r.kind === 'elimination')) return new Set()
  const prelims = t.rounds.filter(r => r.kind !== 'elimination').sort((a, b) => a.number - b.number)
  return new Set(prelims.slice(-t.silentRounds).map(r => r.id))
}
