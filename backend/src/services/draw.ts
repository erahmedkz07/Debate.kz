import { badRequest, forbidden } from '../lib/errors.js'
import { BP_SIDES, isBP, rulesOf } from './formats.js'
import { prisma } from '../lib/prisma.js'
import { getStandings } from './tournaments.js'
import { assignPositions, BRACKET_METHODS, groupRooms, pairTeams, roundRobinPairs, shuffle, type DrawMethod } from './pairing.js'
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
    const judgeConflicts = await seatJudgesAndSave(round, rooms, await rankJudges(tId, judges), true, await conflictChecker(tId), await seenBy(tId, roundId))
    return { method: 'bracket' as const, protectClubs: false, sameClub: 0, rematches: 0, judgeConflicts }
  }
  // power pairing reads the table and the rematch rule reads earlier debates: the earlier preliminary rounds must be over
  const unfinished = await prisma.round.count({ where: { tournamentId: tId, kind: 'preliminary', number: { lt: round.number }, status: { not: 'completed' } } })
  if (unfinished) throw badRequest('previous_round_unfinished')
  // round robin and the bracket methods pair two teams; BP rooms of four use power, high-low or random
  if (isBP(round.tournament.format) && (opts.method === 'round_robin' || BRACKET_METHODS.includes(opts.method ?? 'power'))) throw badRequest('method_not_for_bp')
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
  let scoreOf: Map<string, number> | undefined
  if (method === 'random' || round.number === 1 || previous.length === 0) {
    ordered = shuffle(teams.map(t => t.id))
  } else {
    const s = await getStandings(tId)
    const rank = new Map(s.teams.map((r, i) => [r.team.id, i]))
    scoreOf = new Map(s.teams.map(r => [r.team.id, r.points]))
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
    // round robin: the same team order every round (by when the team was added), round k of the circle
    const robin = method === 'round_robin'
      ? roundRobinPairs([...teams].sort((a, b) => a.id.localeCompare(b.id)).map(t => t.id), round.number - 1)
      : null
    const result = robin
      ? { pairs: robin, sameClub: 0, rematches: robin.filter(([a, b]) => met.has([a, b].sort().join('|'))).length }
      : pairTeams({ order: ordered, method, met, clubOf, protectClubs, scoreOf })
    // side balance: Proposition to the team that has had it less often
    pairs = result.pairs.map(([a, b]) => ((propCount.get(a) ?? 0) <= (propCount.get(b) ?? 0) ? [a, b] : [b, a]))
    report = { sameClub: result.sameClub, rematches: result.rematches }
  }

  const judgeConflicts = await seatJudgesAndSave(round, pairs, await rankJudges(tId, judges), false, await conflictChecker(tId), await seenBy(tId, roundId))
  return { method, protectClubs, ...report, judgeConflicts }
}

type RoundWithTournament = { id: string; tournament: { rooms: string[]; roomLinks: unknown } }
type JudgeRow = { id: string; institutionId: string | null; rating?: number }

// How strong a judge is for this tournament: the speakers' average rating of them once there are MIN_FEEDBACK
// ratings (organizers do not rate judges), otherwise a neutral middle. Equal judges come in a random order, so the
// chairs are not picked alphabetically.
export const MIN_FEEDBACK = 2
const NEUTRAL = 3.5
async function rankJudges<T extends JudgeRow>(tournamentId: string, judges: T[]): Promise<T[]> {
  const rows = await prisma.judgeFeedback.groupBy({ by: ['judgeId'], where: { judge: { tournamentId } }, _avg: { score: true }, _count: { _all: true } })
  const strength = new Map(rows.filter(r => r._count._all >= MIN_FEEDBACK).map(r => [r.judgeId, Number(r._avg.score)]))
  return shuffle(judges).sort((a, b) => (strength.get(b.id) ?? NEUTRAL) - (strength.get(a.id) ?? NEUTRAL) || (b.rating ?? 0) - (a.rating ?? 0))
}

// which teams each judge has already judged in this tournament (other rounds): judges rotate between rooms
type Seen = (judgeId: string, teamIds: string[]) => number
async function seenBy(tournamentId: string, roundId: string): Promise<Seen> {
  const seats = await prisma.debateJudge.findMany({
    where: { debate: { round: { tournamentId, id: { not: roundId } } } },
    select: { judgeId: true, debate: { select: { propositionTeamId: true, oppositionTeamId: true, closingPropositionTeamId: true, closingOppositionTeamId: true } } },
  })
  const seen = new Map<string, Set<string>>()
  for (const { judgeId, debate: d } of seats) {
    const set = seen.get(judgeId) ?? new Set<string>()
    for (const id of [d.propositionTeamId, d.oppositionTeamId, d.closingPropositionTeamId, d.closingOppositionTeamId]) if (id) set.add(id)
    seen.set(judgeId, set)
  }
  return (judgeId, teamIds) => teamIds.filter(id => seen.get(judgeId)?.has(id)).length
}

// Panels: as many chairs as rooms come from the strongest judges, spare judges become wings. A judge never sits with
// a team they have a conflict with (personal, institution, club) and, where the choice allows, not with a team they
// have already judged. Rooms go in order, the top room first. A conflict that cannot be avoided is counted in the report.
// bracket: elimination debates remember their place in the bracket (the room order)
async function seatJudgesAndSave(round: RoundWithTournament, pairs: string[][], judges: JudgeRow[], bracket: boolean, clash: ConflictCheck, seen: Seen) {
  const roundId = round.id
  // chairs for all rooms at once (a choice in one room can block another): a small search with a step limit; the
  // first answer found is the greedy one. Cost: a conflict outweighs everything, then a chair from outside the
  // strongest judges, then a team already judged (rotation), then the strength order.
  const cost = (j: number, room: string[]) => (clash(judges[j].id, room) ? 1e6 : 0) + (j < pairs.length ? 0 : 1e4) + seen(judges[j].id, room) * 100 + j
  let best: number[] = [], bestCost = Infinity, steps = 0
  const taken = new Set<number>(), seat: number[] = []
  const search = (r: number, acc: number) => {
    if (++steps > 20_000 || acc >= bestCost) return
    if (r === pairs.length) { best = [...seat]; bestCost = acc; return }
    const options = judges.map((_, j) => j).filter(j => !taken.has(j)).map(j => ({ j, c: cost(j, pairs[r]) })).sort((x, y) => x.c - y.c)
    for (const { j, c } of options) {
      taken.add(j); seat.push(j)
      search(r + 1, acc + c)
      seat.pop(); taken.delete(j)
    }
  }
  search(0, 0)
  const chairs = best.map(j => judges[j].id)
  const forced = best.filter((j, r) => clash(judges[j].id, pairs[r])).length
  // the rest become wings, the strongest first
  const free = judges.filter((_, j) => !best.includes(j))
  const panels = chairs.map(judgeId => [{ judgeId, isChair: true }])
  // spare judges become wings, the strongest first: each to a room without a conflict, the smallest panel first (one
  // wing per room before a second one), then a room with no team they have already judged
  for (const j of free) {
    const rooms = pairs.map((room, r) => ({ r, n: panels[r].length, s: seen(j.id, room) })).filter(x => !clash(j.id, pairs[x.r]))
    rooms.sort((a, b) => a.n - b.n || a.s - b.s || a.r - b.r)
    if (rooms[0] && rooms[0].n < 3) panels[rooms[0].r].push({ judgeId: j.id, isChair: false })
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
