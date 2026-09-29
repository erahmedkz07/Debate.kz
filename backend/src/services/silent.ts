import { prisma } from '../lib/prisma.js'

// Silent rounds: the results of the last N preliminary rounds stay hidden from the public until the break is announced
// (or the tournament finishes), so nobody can work out the break before it is announced — as at WSDC and most opens.
// Organizers see everything; the draw, the break and the certificates always use the real results.

type RoundRef = { id: string; number: number; kind: string }

// pure: which rounds are silent right now
export function silentIn(t: { silentRounds: number; status: string; rounds: RoundRef[] }): Set<string> {
  if (!t.silentRounds || t.status === 'finished' || t.rounds.some(r => r.kind === 'elimination')) return new Set()
  const prelims = t.rounds.filter(r => r.kind === 'preliminary').sort((a, b) => a.number - b.number)
  return new Set(prelims.slice(-t.silentRounds).map(r => r.id))
}

export async function hiddenRoundIds(tournamentId: string): Promise<Set<string>> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { silentRounds: true, status: true, rounds: { select: { id: true, number: true, kind: true } } },
  })
  return t ? silentIn(t) : new Set()
}
