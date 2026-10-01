import { prisma } from '../lib/prisma.js'

// Closed (silent) rounds: the organizer closes any preliminary round, before or after its draw, and its results stay
// hidden from the public until the break is announced, the tournament finishes, or the organizer opens it again —
// so nobody can work out the break in advance, as at WSDC and most opens.
// Organizers see everything; the draw, the break and the certificates always use the real results.

type RoundRef = { id: string; kind: string; silent: boolean }

// pure: which rounds are hidden right now
export function silentIn(t: { status: string; rounds: RoundRef[] }): Set<string> {
  if (t.status === 'finished' || t.rounds.some(r => r.kind === 'elimination')) return new Set()
  return new Set(t.rounds.filter(r => r.kind === 'preliminary' && r.silent).map(r => r.id))
}

export async function hiddenRoundIds(tournamentId: string): Promise<Set<string>> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { status: true, rounds: { select: { id: true, kind: true, silent: true } } },
  })
  return t ? silentIn(t) : new Set()
}
