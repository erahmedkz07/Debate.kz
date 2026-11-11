import { prisma } from '../lib/prisma.js'
import { fromDay, toDay, todayKz } from '../lib/dates.js'
import { admins, notify, organizersOf } from './notify.js'
import { autoFinish } from './autoFinish.js'
import { missingJudges } from '../routes/tournamentDay.js'

// The day before a tournament its speakers and judges get a reminder (date, place, check-in on arrival).
// BALLOT_REMINDER_MIN after a draw is published, a judge whose ballot is still missing gets one reminder.
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
// preparation (15–30 min) and the debate itself (about an hour): after that a ballot is late
export const BALLOT_REMINDER_MIN = 90

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
export async function runWatchdog(today = todayKz(), now = new Date()) {
  const done = { motionReminders: 0, finishReminders: 0, archived: 0, autoFinished: 0, tomorrowReminders: 0, ballotReminders: 0 }
  // first the tournaments whose final is played: they finish by themselves, no reminder is needed
  done.autoFinished = await autoFinish(now)
  done.ballotReminders = await remindLateBallots(now)
  const live = await prisma.tournament.findMany({
    where: { status: { not: 'finished' }, abandonedAt: null, moderation: 'approved' },
    include: { rounds: { where: { kind: 'preliminary' }, select: { motion: true } }, organizers: { where: { role: 'owner' } } },
  })
  for (const t of live) {
    const start = toDay(t.startDate), end = toDay(t.endDate)
    const toStart = days(today, start), sinceEnd = days(end, today)
    // the day before: speakers and judges, once each (the reminder already sent is found among the notifications)
    if (toStart === 1) done.tomorrowReminders += await remindTomorrow(t)
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

// one reminder per judge and debate (one sent by the organizer counts too); judges without an account cannot get one
async function remindLateBallots(now: Date) {
  const rounds = await prisma.round.findMany({
    where: { status: 'released', releasedAt: { lte: new Date(now.getTime() - BALLOT_REMINDER_MIN * 60_000) }, tournament: { status: { not: 'finished' } } },
    include: {
      tournament: { select: { name: true, format: true } },
      debates: { select: { id: true, room: true, judges: { select: { judgeId: true, isChair: true, judge: { select: { name: true, userId: true } } } }, ballots: { select: { judgeId: true } } } },
    },
  })
  let sent = 0
  for (const r of rounds) {
    for (const d of r.debates) {
      for (const j of missingJudges(d, r.tournament.format)) {
        const userId = j.judge.userId
        if (!userId) continue
        const link = `/ballot/${d.id}`
        if (await prisma.notification.findFirst({ where: { userId, type: 'judge.ballotReminder', link } })) continue
        await notify([userId], 'judge.ballotReminder', { tournament: r.tournament.name, round: r.name, room: d.room }, link)
        sent++
      }
    }
  }
  return sent
}

async function remindTomorrow(t: { id: string; name: string; city: string; venue: string | null; startDate: Date; checkinCode: string | null }) {
  const link = `/tournaments/${t.id}`
  const [teams, regs, judges, sent] = await Promise.all([
    prisma.speaker.findMany({ where: { userId: { not: null }, team: { tournamentId: t.id, swing: false, withdrawnAt: null } }, select: { userId: true } }),
    // the applicant of a confirmed team, even when the speakers are not linked to accounts
    prisma.teamRegistration.findMany({ where: { tournamentId: t.id, status: 'confirmed' }, select: { userId: true } }),
    prisma.judge.findMany({ where: { tournamentId: t.id, userId: { not: null } }, select: { userId: true } }),
    prisma.notification.findMany({ where: { link, type: { in: ['participant.tournamentTomorrow', 'judge.tournamentTomorrow'] } }, select: { userId: true } }),
  ])
  const done = new Set(sent.map(n => n.userId))
  const judgeIds = new Set(judges.map(j => j.userId!).filter(id => !done.has(id)))
  const speakerIds = new Set([...teams, ...regs].map(x => x.userId!).filter(id => !done.has(id) && !judgeIds.has(id)))
  const data = { tournament: t.name, date: toDay(t.startDate).split('-').reverse().slice(0, 2).join('.'), city: t.city, ...(t.venue && { venue: t.venue }), checkin: !!t.checkinCode }
  if (speakerIds.size) await notify([...speakerIds], 'participant.tournamentTomorrow', data, link)
  if (judgeIds.size) await notify([...judgeIds], 'judge.tournamentTomorrow', data, link)
  return speakerIds.size + judgeIds.size
}

// runs every 15 minutes in the API process (one process per server: see deploy/README.md): a finished final turns
// into results and certificates within 2 h 15 min at most
export function startWatchdog() {
  const tick = () => runWatchdog().catch(e => console.error('[watchdog]', e instanceof Error ? e.message : e))
  const timer = setInterval(tick, 15 * 60 * 1000)
  setTimeout(tick, 30_000) // shortly after a restart, not during it
  return () => clearInterval(timer)
}
