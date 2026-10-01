import { prisma } from '../lib/prisma.js'
import { fromDay, toDay, todayKz } from '../lib/dates.js'
import { admins, notify, organizersOf } from './notify.js'

// Keeping tournaments alive, without banning people. Prevention first, a strike only when a tournament is abandoned:
//   - 3 days before the start: the organizers are reminded if preliminary rounds still have no motion;
//   - 1 day after the end: "finish the tournament" (results and certificates wait for it);
//   - 5 days after the end: "in 2 days the tournament goes to the archive";
//   - 7 days after the end, still not finished: the tournament is archived (hidden from the public, it no longer
//     counts toward the owner's limit) and the owner gets a strike.
// A strike also comes for deleting a tournament with confirmed teams less than 3 days before its start.
// 3 active strikes: no new tournaments (the account itself stays: the person can still compete and judge).
// Admins see the strikes and can lift them when the reason was a good one.
export const STRIKE_LIMIT = 3
export const ABANDON_AFTER_DAYS = 7
export const LATE_CANCEL_DAYS = 3

const days = (from: string, to: string) => Math.round((fromDay(to).getTime() - fromDay(from).getTime()) / 86_400_000)

export async function activeStrikes(userId: string) {
  return prisma.organizerStrike.count({ where: { userId, liftedAt: null } })
}

export async function giveStrike(userId: string, tournament: { id: string; name: string }, reason: 'abandoned' | 'late_cancel') {
  await prisma.organizerStrike.create({ data: { userId, tournamentId: tournament.id, tournamentName: tournament.name, reason } })
  const count = await activeStrikes(userId)
  await notify([userId], 'organizer.strike', { tournament: tournament.name, reason, count, limit: STRIKE_LIMIT }, '/dashboard')
  if (count >= STRIKE_LIMIT) await notify(await admins(), 'admin.strikeLimit', { tournament: tournament.name, count }, '/admin?tab=strikes')
}

// one pass over the tournaments; `today` (YYYY-MM-DD, Kazakhstan date) can be given by the e2e run
export async function runWatchdog(today = todayKz()) {
  const done = { motionReminders: 0, finishReminders: 0, archived: 0 }
  const live = await prisma.tournament.findMany({
    where: { status: { not: 'finished' }, abandonedAt: null, moderation: 'approved' },
    include: { rounds: { where: { kind: 'preliminary' }, select: { motion: true } }, organizers: { where: { role: 'owner' } } },
  })
  for (const t of live) {
    const start = toDay(t.startDate), end = toDay(t.endDate)
    const toStart = days(today, start), sinceEnd = days(end, today)
    // motions: once, in the last 3 days before the start
    if (toStart >= 0 && toStart <= 3 && !t.remindedMotionsAt && t.rounds.some(r => !r.motion.trim())) {
      await notify(await organizersOf(t.id), 'organizer.motionsMissing', { tournament: t.name, days: toStart }, `/dashboard/tournaments/${t.id}/rounds`)
      await prisma.tournament.update({ where: { id: t.id }, data: { remindedMotionsAt: new Date() } })
      done.motionReminders++
    }
    // finishing: a reminder on day 1 and a warning on day 5; the archive and a strike on day 7
    if (sinceEnd >= ABANDON_AFTER_DAYS) {
      await prisma.tournament.update({ where: { id: t.id }, data: { abandonedAt: new Date() } })
      const owner = t.organizers[0]?.userId
      if (owner) await giveStrike(owner, t, 'abandoned')
      done.archived++
    } else if (sinceEnd >= 1) {
      const stage = sinceEnd >= ABANDON_AFTER_DAYS - 2 ? 2 : 1
      if ((t.finishReminders ?? 0) < stage) {
        await notify(await organizersOf(t.id), stage === 2 ? 'organizer.archiveWarning' : 'organizer.finishReminder',
          { tournament: t.name, days: ABANDON_AFTER_DAYS - sinceEnd }, `/dashboard/tournaments/${t.id}/settings`)
        await prisma.tournament.update({ where: { id: t.id }, data: { finishReminders: stage } })
        done.finishReminders++
      }
    }
  }
  return done
}

// runs every hour in the API process (one process per server: see deploy/README.md)
export function startWatchdog() {
  const tick = () => runWatchdog().catch(e => console.error('[watchdog]', e instanceof Error ? e.message : e))
  const timer = setInterval(tick, 60 * 60 * 1000)
  setTimeout(tick, 30_000) // shortly after a restart, not during it
  return () => clearInterval(timer)
}
