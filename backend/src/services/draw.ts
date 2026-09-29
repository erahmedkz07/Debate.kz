import { badRequest, forbidden } from '../lib/errors.js'
import { BP_SIDES, isBP, rulesOf } from './formats.js'
import { prisma } from '../lib/prisma.js'
import { getStandings } from './tournaments.js'
import { assignPositions, groupRooms, pairTeams, shuffle, type DrawMethod } from './pairing.js'
import { eliminationRooms } from './playoffs.js'
import { conflictChecker, type ConflictCheck } from './conflicts.js'

const ROOMS = ['Ауд. 101', 'Ауд. 102', 'Ауд. 203', 'Ауд. 204', 'Ауд. 305', 'Актовый зал', 'Ауд. 310', 'Ауд. 412', 'Ауд. 415', 'Библиотека', 'Ауд. 501', 'Ауд. 502']
export const DEFAULT_ROOMS = ROOMS
// the organizer's own rooms first; when they run out, numbered rooms continue
export const roomName = (i: number, rooms: string[] = ROOMS) => rooms[i] ?? `Ауд. ${601 + i - rooms.length}`

// WSDC draw:
// 1) teams ordered by wins, then speaker points (round 1 and the random method: random order)
// 2) pairs by the method (power: neighbours, high_low: top vs bottom, random), avoiding rematches and, in protected
//    rounds, teams of the same club (club, or institution when the team has no club) — see services/pairing.ts
// 3) side goes to the team that has been Proposition less often
// 4) one judge per room: best-rated judges chair, spare judges become wings,
//    a judge never sits on a debate with a team from their own institution
// British Parliamentary: rooms of four (services/pairing.ts groupRooms), positions OG/OO/CG/CO balanced per team.
// presentOnly: only teams that checked in; addSwing: stand-in "swing" teams fill the last debate
// (one for an odd number in two-team formats, up to three in BP)
export interface DrawOptions { presentOnly?: boolean; addSwing?: boolean; method?: DrawMethod; protectClubs?: boolean }
export const CLUB_PROTECTED_ROUNDS = 2 // by default the first two rounds keep clubmates apart

export async function generateDraw(roundId: string, opts: DrawOptions = {}) {
  const round = await prisma.round.findUnique({ where: { id: roundId }, include: { tournament: true } })
  if (!round) throw badRequest('round_not_found')
  if (round.status === 'completed') throw forbidden('round_completed')
  const hasBallots = await prisma.ballot.count({ where: { debate: { roundId } } })
  if (hasBallots) throw forbidden('ballots_already_submitted')

  const tId = round.tournamentId
  // the break: the bracket decides who meets whom; no swing teams, no power pairing
  if (round.kind === 'elimination') {
    const rooms = await eliminationRooms(roundId)
    const [teams, judges] = await Promise.all([
      prisma.team.findMany({ where: { id: { in: rooms.flat() } }, select: { id: true, institutionId: true } }),
      prisma.judge.findMany({ where: { tournamentId: tId }, orderBy: [{ rating: 'desc' }, { name: 'asc' }] }),
    ])
    if (judges.length < rooms.length) throw badRequest('not_enough_judges', { need: rooms.length, have: judges.length, teams: teams.length })
    const judgeConflicts = await seatJudgesAndSave(round, rooms, judges, true, await conflictChecker(tId))
    return { method: 'bracket' as const, protectClubs: false, sameClub: 0, rematches: 0, judgeConflicts }
  }
  const [teams, judges, previous] = await Promise.all([
    prisma.team.findMany({
      where: { tournamentId: tId, swing: false, ...(opts.presentOnly && { checkedInAt: { not: null } }) },
      select: { id: true, institutionId: true, clubId: true },
    }),
    prisma.judge.findMany({ where: { tournamentId: tId }, orderBy: [{ rating: 'desc' }, { name: 'asc' }] }),
    prisma.debate.findMany({
      where: { round: { tournamentId: tId, number: { lt: round.number } } },
      select: { propositionTeamId: true, oppositionTeamId: true, closingPropositionTeamId: true, closingOppositionTeamId: true },
    }),
  ])
  const perRoom = isBP(round.tournament.format) ? 4 : 2
  if (teams.length % perRoom && opts.addSwing && teams.length >= 1) {
    const missing = perRoom - (teams.length % perRoom)
    for (let i = 0; i < missing; i++) teams.push(await swingTeam(tId, i))
  }
  if (teams.length < perRoom) throw badRequest('not_enough_teams')
  if (perRoom === 2 && teams.length % 2) throw badRequest('odd_number_of_teams')
  if (perRoom === 4 && teams.length % 4) throw badRequest('bp_teams_multiple_of_four', { teams: teams.length })
  // one judge per room: the error says how many are needed and how many there are
  const roomsNeeded = teams.length / perRoom
  if (judges.length < roomsNeeded) throw badRequest('not_enough_judges', { need: roomsNeeded, have: judges.length, teams: teams.length })

  // order teams
  const method = opts.method ?? 'power'
  let ordered: string[]
  if (method === 'random' || round.number === 1 || previous.length === 0) {
    ordered = shuffle(teams.map(t => t.id))
  } else {
    const s = await getStandings(tId)
    const rank = new Map(s.teams.map((r, i) => [r.team.id, i]))
    // equal records keep a random order among themselves
    ordered = shuffle(teams.map(t => t.id)).sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999))
  }

  const protectClubs = opts.protectClubs ?? round.number <= CLUB_PROTECTED_ROUNDS
  const clubOf = new Map(teams.map(t => [t.id, t.clubId ?? t.institutionId]))
  let pairs: string[][], report: { sameClub: number; rematches: number }
  if (perRoom === 4) {
    // BP: how often each team has held OG, OO, CG, CO
    const counts = new Map<string, number[]>()
    for (const p of previous) BP_SIDES.forEach((_, pos) => {
      const id = [p.propositionTeamId, p.oppositionTeamId, p.closingPropositionTeamId, p.closingOppositionTeamId][pos]
      if (!id) return
      const c = counts.get(id) ?? [0, 0, 0, 0]
      c[pos]++
      counts.set(id, c)
    })
    const result = groupRooms({ order: ordered, method, clubOf, protectClubs })
    pairs = result.rooms.map(room => assignPositions(room, counts))
    report = { sameClub: result.sameClub, rematches: 0 }
  } else {
    const met = new Set(previous.map(p => [p.propositionTeamId, p.oppositionTeamId].sort().join('|')))
    const propCount = new Map<string, number>()
    previous.forEach(p => propCount.set(p.propositionTeamId, (propCount.get(p.propositionTeamId) ?? 0) + 1))
    const result = pairTeams({ order: ordered, method, met, clubOf, protectClubs })
    // side balance: Proposition to the team that has had it less often
    pairs = result.pairs.map(([a, b]) => ((propCount.get(a) ?? 0) <= (propCount.get(b) ?? 0) ? [a, b] : [b, a]))
    report = { sameClub: result.sameClub, rematches: result.rematches }
  }

  const judgeConflicts = await seatJudgesAndSave(round, pairs, judges, false, await conflictChecker(tId))
  return { method, protectClubs, ...report, judgeConflicts }
}

type RoundWithTournament = { id: string; tournament: { rooms: string[]; roomLinks: unknown } }
type JudgeRow = { id: string; institutionId: string | null }

// one judge per room: best-rated judges chair, spare judges become wings; a judge never sits with a team of their institution.
// bracket: elimination debates remember their place in the bracket (the room order)
async function seatJudgesAndSave(round: RoundWithTournament, pairs: string[][], judges: JudgeRow[], bracket: boolean, clash: ConflictCheck) {
  const roundId = round.id
  const free = [...judges] // best-rated first
  // chairs: the best-rated judge without a conflict; when none is left, swap with an earlier room whose chair
  // also fits here and which can take a free judge instead. A conflict that cannot be avoided is counted in the report.
  const chairs: string[] = []
  let forced = 0
  pairs.forEach((room, r) => {
    let i = free.findIndex(j => !clash(j.id, room))
    if (i === -1) {
      for (let k = 0; k < r && i === -1; k++) {
        if (clash(chairs[k], room)) continue
        const f = free.findIndex(j => !clash(j.id, pairs[k]))
        if (f === -1) continue
        chairs[r] = chairs[k]
        chairs[k] = free.splice(f, 1)[0].id
        i = -2
      }
      if (i === -2) return
      i = 0
      forced++
    }
    chairs[r] = free.splice(i, 1)[0].id
  })
  const panels = chairs.map(judgeId => [{ judgeId, isChair: true }])
  // spare judges become wings, round-robin over rooms, never in a room they have a conflict with
  for (let r = 0; free.length && r < pairs.length * 2; r++) {
    const room = r % pairs.length
    const i = free.findIndex(j => !clash(j.id, pairs[room]))
    if (i !== -1) panels[room].push({ judgeId: free.splice(i, 1)[0].id, isChair: false })
  }

  // online tournaments: each room brings its video call link
  const links = (round.tournament.roomLinks ?? {}) as Record<string, string>
  await prisma.$transaction(async tx => {
    await tx.debate.deleteMany({ where: { roundId } })
    for (let i = 0; i < pairs.length; i++) {
      await tx.debate.create({
        data: {
          roundId, room: roomName(i, round.tournament.rooms.length ? round.tournament.rooms : ROOMS), propositionTeamId: pairs[i][0], oppositionTeamId: pairs[i][1],
          closingPropositionTeamId: pairs[i][2] ?? null, closingOppositionTeamId: pairs[i][3] ?? null,
          bracketSlot: bracket ? i : null,
          onlineUrl: links[roomName(i, round.tournament.rooms.length ? round.tournament.rooms : ROOMS)] ?? null,
          judges: { create: panels[i] },
        },
      })
    }
  })
  return forced
}

// the tournament's stand-in teams (each created once): placeholder speakers so judges can score them; never ranked.
// Two-team formats need at most one ("Swing"), BP up to three ("Swing", "Swing 2", "Swing 3").
async function swingTeam(tournamentId: string, index = 0) {
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId }, select: { format: true } })
  const name = index ? `Swing ${index + 1}` : 'Swing'
  const existing = await prisma.team.findFirst({ where: { tournamentId, swing: true, name }, select: { id: true, institutionId: true, clubId: true } })
  if (existing) return existing
  return prisma.team.create({
    data: { tournamentId, name, swing: true, speakers: { create: Array.from({ length: rulesOf(t.format).speakers }, (_, i) => ({ name: `Swing ${i + 1}`, position: i + 1 })) } },
    select: { id: true, institutionId: true, clubId: true },
  })
}
