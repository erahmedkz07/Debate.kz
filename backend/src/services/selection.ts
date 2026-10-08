import { randomInt } from 'node:crypto'
import { badRequest, conflict, forbidden } from '../lib/errors.js'
import { prisma } from '../lib/prisma.js'
import { assertRoomForTeam } from './plans.js'
import { participationIn } from './tournaments.js'
import { institutionIdFor } from './institutions.js'
import { background, notifyRegistration } from './notify.js'
import { sameName } from '../lib/names.js'

// Selection of teams. Applications are not limited: everyone can apply, and the tournament page shows live how many
// applied for how many places. The final list stays within the team limit (maxTeams) and, if set, a quota per club.
// How the places are filled is the organizer's choice (tournaments.selection_mode):
//   manual     — the organizer confirms teams one by one (the default);
//   first_come — a team gets a place as soon as it applies, while places last; then it goes to the waitlist;
//   lottery    — applications are collected, then a public random draw orders them: places go in that order,
//                the rest wait in that order. Applications after the draw join the end of the waitlist.
// Waitlisted teams move up by themselves when a place frees (first come and lottery; manual — the organizer decides).

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// is there a place for this application: the team limit and the club quota
async function placeFor(tournamentId: string, clubId: string | null) {
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId }, include: { _count: { select: { teams: { where: { swing: false } } } } } })
  if (t._count.teams >= t.maxTeams) return { ok: false as const, reason: 'tournament_full', t }
  if (t.clubQuota && clubId && (await prisma.team.count({ where: { tournamentId, clubId, swing: false } })) >= t.clubQuota) {
    return { ok: false as const, reason: 'club_quota_reached', t }
  }
  return { ok: true as const, t }
}

// confirms an application: the team is created and the applicant is linked to their speaker slot
export async function confirmRegistration(regId: string) {
  const reg = await prisma.teamRegistration.findUniqueOrThrow({ where: { id: regId }, include: { tournament: true, user: true } })
  if (reg.status === 'confirmed' || reg.status === 'rejected') throw badRequest('already_processed')
  // the applicant may have become a judge/organizer here after applying
  const role = await participationIn(reg.userId, reg.tournamentId)
  if (role.judge || role.organizer) throw forbidden('conflict_of_interest')
  const clubTeam = reg.clubTeamId ? await prisma.clubTeam.findUnique({ where: { id: reg.clubTeamId } }) : null
  const place = await placeFor(reg.tournamentId, clubTeam?.clubId ?? reg.clubId)
  if (!place.ok) throw badRequest(place.reason, place.reason === 'club_quota_reached' ? { quota: place.t.clubQuota } : undefined)
  assertRoomForTeam(place.t, place.t._count.teams)
  if (await prisma.team.findUnique({ where: { tournamentId_name: { tournamentId: reg.tournamentId, name: reg.teamName } } })) throw conflict('team_name_taken')
  const instId = await institutionIdFor(reg.institution, reg.tournament.level)
  await prisma.$transaction(async (tx: Tx) => {
    await tx.team.create({
      data: {
        tournamentId: reg.tournamentId, name: reg.teamName, institutionId: instId, city: reg.user.city,
        clubId: clubTeam?.clubId ?? reg.clubId ?? null, clubTeamId: clubTeam?.id ?? null,
        // the applicant is linked to their own slot even when the name is written differently (word order, case)
        speakers: { create: reg.speakers.map((name, i) => ({ name, position: i + 1, userId: sameName(name, reg.user.name) ? reg.userId : undefined })) },
      },
    })
    await tx.teamRegistration.update({ where: { id: reg.id }, data: { status: 'confirmed' } })
  })
  background(notifyRegistration(reg.id))
}

// tries to confirm; when there is no place (limit, quota, Pro not paid) the application waits
async function confirmOrWait(regId: string) {
  try {
    await confirmRegistration(regId)
    return 'confirmed' as const
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'tournament_full' || code === 'club_quota_reached' || code === 'payment_required') {
      await prisma.teamRegistration.update({ where: { id: regId }, data: { status: 'waitlisted' } })
      background(notifyRegistration(regId))
      return 'waitlisted' as const
    }
    throw e
  }
}

// a new application: first come gets a place at once; after a lottery it joins the end of the waitlist order
export async function onApplication(regId: string) {
  const reg = await prisma.teamRegistration.findUniqueOrThrow({ where: { id: regId }, include: { tournament: true } })
  const t = reg.tournament
  if (t.selectionMode === 'first_come') return confirmOrWait(regId)
  if (t.selectionMode === 'lottery' && t.lotteryAt) {
    const last = await prisma.teamRegistration.aggregate({ where: { tournamentId: t.id }, _max: { lotteryRank: true } })
    await prisma.teamRegistration.update({ where: { id: regId }, data: { lotteryRank: (last._max.lotteryRank ?? 0) + 1 } })
    return confirmOrWait(regId)
  }
  return 'pending' as const
}

// the public draw of the lottery: a random order of the pending applications, places in that order
export async function runLottery(tournamentId: string) {
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } })
  if (t.selectionMode !== 'lottery') throw badRequest('not_lottery')
  if (t.lotteryAt) throw badRequest('lottery_done')
  const pending = await prisma.teamRegistration.findMany({ where: { tournamentId, status: 'pending' }, orderBy: { createdAt: 'asc' } })
  if (!pending.length) throw badRequest('no_applications')
  // Fisher–Yates with a cryptographic random: nobody can predict or steer the order
  const order = [...pending]
  for (let i = order.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  await prisma.$transaction(order.map((r, i) => prisma.teamRegistration.update({ where: { id: r.id }, data: { lotteryRank: i + 1 } })))
  await prisma.tournament.update({ where: { id: tournamentId }, data: { lotteryAt: new Date() } })
  const result = { confirmed: 0, waitlisted: 0 }
  for (const r of order) result[await confirmOrWait(r.id)]++
  return result
}

// a place freed (a team removed, the limit raised): the waitlist moves up in its order, skipping teams over the club quota
export async function fillFromWaitlist(tournamentId: string) {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId } })
  if (!t || t.selectionMode === 'manual' || t.status === 'finished') return 0
  const waiting = await prisma.teamRegistration.findMany({
    where: { tournamentId, status: 'waitlisted' },
    orderBy: [{ lotteryRank: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  })
  let moved = 0
  for (const r of waiting) {
    const place = await placeFor(tournamentId, r.clubId)
    if (!place.ok && place.reason === 'tournament_full') break
    if (!place.ok) continue
    try {
      await confirmRegistration(r.id)
      moved++
    } catch {
      // e.g. the name is taken now or the applicant became a judge: the next one in line
    }
  }
  return moved
}

// the public view of the selection: how many applied for how many places and, after a lottery, its order
export async function selectionOf(tournamentId: string) {
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId }, include: { _count: { select: { teams: { where: { swing: false } } } } } })
  const regs = await prisma.teamRegistration.findMany({
    where: { tournamentId, status: { not: 'rejected' } },
    orderBy: [{ lotteryRank: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    select: { teamName: true, status: true, lotteryRank: true },
  })
  return {
    mode: t.selectionMode, clubQuota: t.clubQuota ?? undefined, places: t.maxTeams, taken: t._count.teams,
    applications: regs.length, waitlisted: regs.filter(r => r.status === 'waitlisted').length,
    lotteryAt: t.lotteryAt?.toISOString(),
    ...(t.lotteryAt && { lottery: regs.filter(r => r.lotteryRank).map(r => ({ rank: r.lotteryRank!, team: r.teamName, status: r.status })) }),
  }
}
