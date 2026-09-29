import { badRequest, forbidden } from '../lib/errors.js'
import { prisma } from '../lib/prisma.js'
import { BP_SIDES, isBP, teamOnSide, type SideCode } from './formats.js'
import { assignPositions } from './pairing.js'
import { getStandings, teamInclude, toTeam } from './tournaments.js'

// The break (playoffs). When every preliminary round is completed the organizer announces the break: the top
// `breakSize` teams of the standings get seeds 1..N and the elimination rounds are created.
//   two-team formats: 1/8 → quarterfinal → semifinal → final, one winner goes on from each debate;
//   British Parliamentary: rooms of four, the top two of each room go on; the final is one room of four.
// The bracket keeps the top seeds apart until the end (seed 1 and seed 2 can meet only in the final).
// The champion is the winner of the final, not the leader of the standings.

import { STAGE_NAME, stageOf } from './stages.js'

// seeds in bracket order: 1 and 2 at opposite ends, then 1–N, 2–(N-1)… (for 8: 1 8 4 5 2 7 3 6)
export function bracketOrder(n: number): number[] {
  let order = [1]
  while (order.length < n) {
    const size = order.length * 2
    order = order.flatMap(s => [s, size + 1 - s])
  }
  return order
}

// the stages of a break: team counts from the first elimination round down to the final
export function breakStages(breakSize: number, bp: boolean) {
  const last = bp ? 4 : 2
  const stages: number[] = []
  for (let n = breakSize; n >= last; n /= 2) stages.push(n)
  return stages
}

export async function announceBreak(tournamentId: string) {
  const t = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    include: { rounds: { orderBy: { number: 'asc' } }, teams: { where: { swing: false }, select: { id: true } } },
  })
  const bp = isBP(t.format)
  if (t.status !== 'ongoing') throw badRequest('tournament_not_ongoing')
  if (t.rounds.some(r => r.kind === 'elimination')) throw badRequest('break_already_announced')
  const prelims = t.rounds.filter(r => r.kind === 'preliminary')
  if (!prelims.length || prelims.some(r => r.status !== 'completed')) throw badRequest('preliminaries_unfinished')
  if (t.breakSize < (bp ? 4 : 2)) throw badRequest('break_too_small')
  if (t.teams.length < t.breakSize) throw badRequest('not_enough_teams_for_break', { need: t.breakSize, have: t.teams.length })

  const standings = await getStandings(tournamentId)
  const seeds = standings.teams.slice(0, t.breakSize).map(r => r.team.id)
  const next = Math.max(...t.rounds.map(r => r.number)) + 1
  await prisma.$transaction(async tx => {
    await tx.team.updateMany({ where: { tournamentId }, data: { breakSeed: null } })
    for (const [i, id] of seeds.entries()) await tx.team.update({ where: { id }, data: { breakSeed: i + 1 } })
    for (const [i, teams] of breakStages(t.breakSize, bp).entries()) {
      await tx.round.create({
        data: { tournamentId, number: next + i, name: STAGE_NAME[stageOf(teams, bp)], kind: 'elimination', teamsInRound: teams, date: t.endDate },
      })
    }
  })
  return getBracket(tournamentId, true)
}

// undo the break while nothing of it has been played (no elimination round released)
export async function cancelBreak(tournamentId: string) {
  const rounds = await prisma.round.findMany({ where: { tournamentId, kind: 'elimination' } })
  if (!rounds.length) throw badRequest('break_not_announced')
  if (rounds.some(r => r.status !== 'draft')) throw forbidden('break_in_progress')
  await prisma.$transaction([
    prisma.round.deleteMany({ where: { tournamentId, kind: 'elimination' } }),
    prisma.team.updateMany({ where: { tournamentId }, data: { breakSeed: null } }),
  ])
}

type RoomTeams = string[] // team ids in speaking order (2, or 4 in BP)

// who plays in an elimination round, room by room in bracket order
export async function eliminationRooms(roundId: string): Promise<RoomTeams[]> {
  const round = await prisma.round.findUniqueOrThrow({ where: { id: roundId }, include: { tournament: true } })
  const bp = isBP(round.tournament.format)
  const perRoom = bp ? 4 : 2
  const previous = await prisma.round.findFirst({
    where: { tournamentId: round.tournamentId, kind: 'elimination', number: { lt: round.number } },
    orderBy: { number: 'desc' },
    include: { debates: { orderBy: { bracketSlot: 'asc' } } },
  })
  let order: string[] // teams in bracket order, cut into rooms of perRoom
  if (!previous) {
    const seeded = await prisma.team.findMany({ where: { tournamentId: round.tournamentId, breakSeed: { not: null } }, select: { id: true, breakSeed: true } })
    const bySeed = new Map(seeded.map(s => [s.breakSeed!, s.id]))
    if (bySeed.size !== round.teamsInRound) throw badRequest('break_not_announced')
    order = bracketOrder(round.teamsInRound!).map(seed => bySeed.get(seed)!)
  } else {
    if (previous.status !== 'completed') throw badRequest('previous_round_unfinished')
    // winners go on (BP: the top two of each room), keeping the bracket order
    order = previous.debates.flatMap(d => {
      if (d.ranking.length) return d.ranking.slice(0, 2).map(side => teamOnSide(d, side)!)
      return [teamOnSide(d, d.winner!)!]
    })
  }
  const rooms: RoomTeams[] = []
  for (let i = 0; i < order.length; i += perRoom) rooms.push(order.slice(i, i + perRoom))
  const seedOf = new Map((await prisma.team.findMany({ where: { id: { in: order } }, select: { id: true, breakSeed: true } })).map(t => [t.id, t.breakSeed ?? 99]))
  // two-team formats: the higher seed is Proposition (the organizer can swap); BP: positions drawn at random
  return rooms.map(room => (bp ? assignPositions(room, new Map()) : [...room].sort((a, b) => seedOf.get(a)! - seedOf.get(b)!)))
}

// the whole bracket for the tournament page; draft rounds stay hidden from the public
export async function getBracket(tournamentId: string, manager: boolean) {
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId }, select: { format: true, breakSize: true } })
  const bp = isBP(t.format)
  const [seeded, rounds] = await Promise.all([
    prisma.team.findMany({ where: { tournamentId, breakSeed: { not: null } }, include: teamInclude, orderBy: { breakSeed: 'asc' } }),
    prisma.round.findMany({
      where: { tournamentId, kind: 'elimination' }, orderBy: { number: 'asc' },
      include: { debates: { orderBy: { bracketSlot: 'asc' } } },
    }),
  ])
  const final = rounds.at(-1)
  const places = await finalPlaces(tournamentId)
  const champion = places ? seeded.find(s => places.get(s.id) === 1) : undefined
  return {
    format: t.format, breakSize: t.breakSize, announced: rounds.length > 0,
    seeds: seeded.map(s => ({ seed: s.breakSeed!, team: toTeam(s) })),
    rounds: rounds.map(r => ({
      id: r.id, number: r.number, name: r.name, stage: stageOf(r.teamsInRound ?? 0, bp), teamsInRound: r.teamsInRound, status: r.status,
      motion: r.status === 'draft' && !manager ? '' : r.motion,
      debates: r.status === 'draft' && !manager ? [] : r.debates.map(d => ({
        id: d.id, slot: d.bracketSlot ?? 0, room: d.room,
        teams: BP_SIDES.map(side => ({ side, teamId: teamOnSide(d, side) })).filter(x => x.teamId),
        winner: r.status === 'completed' ? d.winner ?? undefined : undefined,
        ranking: r.status === 'completed' && d.ranking.length ? d.ranking : undefined,
      })),
    })),
    ...(champion && final?.status === 'completed' && { champion: toTeam(champion) }),
  }
}

// Final places once the final is completed: the champion 1st, then by the stage a team went out in
// (two-team: final loser 2nd, semifinal losers 3rd…; BP final: places 1–4 of the final room, semifinal 3rd–4th of each room 5th…),
// then the teams that did not break, in the order of the standings. null while the playoffs are not over.
export async function finalPlaces(tournamentId: string): Promise<Map<string, number> | null> {
  const rounds = await prisma.round.findMany({
    where: { tournamentId, kind: 'elimination' }, orderBy: { number: 'desc' }, include: { debates: true },
  })
  if (!rounds.length || rounds.some(r => r.status !== 'completed')) return null
  const places = new Map<string, number>()
  for (const r of rounds) {
    const n = r.teamsInRound ?? 0
    for (const d of r.debates) {
      if (d.ranking.length) {
        // BP: the final room gives places 1–4; an earlier room sends its 3rd and 4th out at place n/2 + 1
        d.ranking.forEach((side: SideCode, i) => {
          const id = teamOnSide(d, side)!
          if (places.has(id)) return
          if (n === 4) places.set(id, i + 1)
          else if (i >= 2) places.set(id, n / 2 + 1)
        })
      } else {
        const loser = teamOnSide(d, d.winner === 'proposition' ? 'opposition' : 'proposition')!
        if (n === 2) places.set(teamOnSide(d, d.winner!)!, 1)
        if (!places.has(loser)) places.set(loser, n === 2 ? 2 : n / 2 + 1)
      }
    }
  }
  const standings = await getStandings(tournamentId)
  let next = places.size + 1 // the teams that broke hold places 1..breakSize
  for (const row of standings.teams) if (!places.has(row.team.id)) places.set(row.team.id, next++)
  return places
}
