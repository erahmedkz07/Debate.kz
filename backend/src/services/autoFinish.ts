import { prisma } from '../lib/prisma.js'
import { withLock } from '../lib/lock.js'
import { ensureCertificates } from './certificates.js'
import { issueAwardCertificates } from './awards.js'
import { background, notify, notifyRoundCompleted, notifyTournamentFinished, organizersOf } from './notify.js'

// Real tournaments ended without the last two clicks ("complete the final", "finish the tournament"): results and
// certificates never came out. Now the final finishes the tournament by itself. Once the final of every bracket has
// its result and no ballot came for AUTO_FINISH_AFTER_MS (time to fix a typo or to wait for the other judges),
// the playoff rounds are completed and the tournament is finished, exactly as the organizer's buttons would do.
export const AUTO_FINISH_AFTER_MS = 2 * 60 * 60 * 1000

export async function autoFinish(now = new Date()) {
  const live = await prisma.tournament.findMany({
    where: { status: 'ongoing', abandonedAt: null, moderation: 'approved', rounds: { some: { kind: 'elimination' } } },
    select: { id: true, name: true, rounds: { select: { id: true, kind: true, status: true, category: true, number: true, debates: { select: { winner: true, ballots: { select: { submittedAt: true } } } } } } },
  })
  let finished = 0
  for (const t of live) {
    // a preliminary round still running: the tournament is not at its end
    if (t.rounds.some(r => r.kind === 'preliminary' && r.status === 'released')) continue
    const playoffs = t.rounds.filter(r => r.kind === 'elimination')
    if (playoffs.some(r => r.status === 'draft' || r.debates.length === 0 || r.debates.some(d => !d.winner))) continue
    // every bracket (the open break, each league or category) ends with its final: one room
    const brackets = new Map<string, typeof playoffs>()
    for (const r of playoffs) brackets.set(r.category ?? '', [...(brackets.get(r.category ?? '') ?? []), r])
    const allFinals = [...brackets.values()].every(rs => rs.reduce((a, b) => (b.number > a.number ? b : a)).debates.length === 1)
    if (!allFinals) continue
    const last = Math.max(...playoffs.flatMap(r => r.debates.flatMap(d => d.ballots.map(b => b.submittedAt.getTime()))), 0)
    if (now.getTime() - last < AUTO_FINISH_AFTER_MS) continue

    const open = playoffs.filter(r => r.status !== 'completed').map(r => r.id)
    const done = await withLock(`finish:${t.id}`, () => prisma.$transaction(async tx => {
      for (const id of open) {
        await tx.debate.updateMany({ where: { roundId: id }, data: { ballotStatus: 'confirmed' } })
        await tx.round.update({ where: { id }, data: { status: 'completed' } })
      }
      // only if nobody finished it meanwhile
      return (await tx.tournament.updateMany({ where: { id: t.id, status: 'ongoing' }, data: { status: 'finished' } })).count === 1
    }))
    if (!done) continue
    finished++
    background((async () => {
      for (const id of open) await notifyRoundCompleted(id)
      await ensureCertificates(t.id)
      await issueAwardCertificates(t.id)
      await notifyTournamentFinished(t.id)
      await notify(await organizersOf(t.id), 'organizer.autoFinished', { tournament: t.name }, `/dashboard/tournaments/${t.id}`)
    })())
  }
  return finished
}
