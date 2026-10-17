import { badRequest, forbidden } from '../lib/errors.js'
import { BP_SIDES, isBP, rulesOf } from './formats.js'
import { prisma } from '../lib/prisma.js'
import { getStandings, leaguesOf } from './tournaments.js'
import { assignPositions, BRACKET_METHODS, groupRooms, pairTeams, roundRobinPairs, shuffle, type DrawMethod } from './pairing.js'
import { eliminationRooms } from './playoffs.js'
import { conflictChecker, type ConflictCheck } from './conflicts.js'

// the organizer's own rooms first; when they run out (or there are none) the rooms are simply numbered
export const roomName = (i: number, rooms: string[] = []) => rooms[i] ?? `Комната ${i + 1 - rooms.length}`

// Leagues with rooms of their own: each room of the draw takes a room of its league, then a room for any league, then
// a numbered one. Without leagues (or rooms set per league) the rooms go in order.
function roomsFor(pairs: string[][], rooms: string[], roomLeagues: Record<string, string>, leagueOfTeam: Map<string, string | null> | null) {
  if (!leagueOfTeam || !Object.keys(roomLeagues).length) return pairs.map((_, i) => roomName(i, rooms))
  const free = [...rooms]
  let extra = 0
  return pairs.map(room => {
    const league = leagueOfTeam.get(room[0]) ?? null
    const own = free.findIndex(r => league && roomLeagues[r] === league)
    const any = own === -1 ? free.findIndex(r => !roomLeagues[r]) : own
    if (any === -1) return `Комната ${++extra}`
    return free.splice(any, 1)[0]
  })
}

// WSDC draw:
// 1) teams ordered by wins, then speaker points (round 1 and the random method: random order)
// 2) pairs by the method (power: neighbours, high_low: top vs bottom, random), avoiding rematches and, in protected
//    rounds, teams of the same club (club, or institution when the team has no club) — see services/pairing.ts
// 3) side goes to the team that has been Proposition less often
// 4) one judge per room: best-rated judges chair, spare judges become wings,
//    a judge never sits on a debate with a team from their own institution
// British Parliamentary: rooms of four (services/pairing.ts groupRooms), positions OG/OO/CG/CO balanced per team.
// presentOnly: only teams that checked in; addSwing: stand-in "swing" teams fill the last debate
// (one for an odd number in two-team formats, up to three in BP). Leagues: each league is drawn on its own (drawGroup).
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
    const { rooms, slots } = await eliminationRooms(roundId)
    const [teams, judges, elsewhere] = await Promise.all([
      prisma.team.findMany({ where: { id: { in: rooms.flat() } }, select: { id: true, institutionId: true, league: true } }),
      prisma.judge.findMany({ where: { tournamentId: tId, leftAt: null }, orderBy: [{ rating: 'desc' }, { name: 'asc' }] }),
      // judges of another bracket's playoff round that is still on (the leagues play at the same time): chosen last
      prisma.debateJudge.findMany({ where: { debate: { round: { tournamentId: tId, kind: 'elimination', status: { not: 'completed' }, id: { not: roundId }, category: { not: round.category } } } }, select: { judgeId: true } }),
    ])
    if (judges.length < rooms.length) throw badRequest('not_enough_judges', { need: rooms.length, have: judges.length, teams: teams.length })
    const leagues = leaguesOf(round.tournament)
    const leagueOfTeam = leagues.length ? new Map(teams.map(x => [x.id, x.league] as const)) : null
    const clash = withLeagues(await conflictChecker(tId), judges, rooms, leagueOfTeam, leagues)
    const busy = new Set(elsewhere.map(x => x.judgeId))
    const ranked = await rankJudges(tId, judges)
    const ordered = [...ranked.filter(j => !busy.has(j.id)), ...ranked.filter(j => busy.has(j.id))]
    const roomNames = roomsFor(rooms, round.tournament.rooms, (round.tournament.roomLeagues ?? {}) as Record<string, string>, leagueOfTeam)
    const judgeConflicts = await seatJudgesAndSave(round, rooms, ordered, slots, clash, await seenBy(tId, roundId), roomNames)
    return { method: 'bracket' as const, protectClubs: false, sameClub: 0, rematches: 0, judgeConflicts }
  }
  // power pairing reads the table and the rematch rule reads earlier debates: the earlier preliminary rounds must be over
  const unfinished = await prisma.round.count({ where: { tournamentId: tId, kind: 'preliminary', number: { lt: round.number }, status: { not: 'completed' } } })
  if (unfinished) throw badRequest('previous_round_unfinished')
  // round robin and the bracket methods pair two teams; BP rooms of four use power, high-low or random
  if (isBP(round.tournament.format) && (opts.method === 'round_robin' || BRACKET_METHODS.includes(opts.method ?? 'power'))) throw badRequest('method_not_for_bp')
  const [allTeams, judges, previous] = await Promise.all([
    prisma.team.findMany({
      where: { tournamentId: tId, swing: false, withdrawnAt: null, ...(opts.presentOnly && { checkedInAt: { not: null } }) },
      select: { id: true, institutionId: true, clubId: true, league: true, name: true },
    }),
    prisma.judge.findMany({ where: { tournamentId: tId, leftAt: null }, orderBy: [{ rating: 'desc' }, { name: 'asc' }] }),
    prisma.debate.findMany({
      where: { round: { tournamentId: tId, number: { lt: round.number } } },
      select: { propositionTeamId: true, oppositionTeamId: true, closingPropositionTeamId: true, closingOppositionTeamId: true },
    }),
  ])
  const perRoom = isBP(round.tournament.format) ? 4 : 2

  // Leagues (a Russian and a Kazakh league in one tournament): each league is drawn on its own, its teams only meet
  // each other; the rooms and the judges are then shared out over the whole round. Every team must be in a league.
  const leagues = leaguesOf(round.tournament)
  const groups: { league: string | null; teams: typeof allTeams }[] = []
  if (leagues.length) {
    const without = allTeams.filter(t => !t.league || !leagues.some(l => l.key === t.league))
    if (without.length) throw badRequest('teams_without_league', { teams: without.map(t => t.name).slice(0, 10).join(', ') })
    for (const l of leagues) {
      const teams = allTeams.filter(t => t.league === l.key)
      if (teams.length) groups.push({ league: l.key, teams })
    }
  } else {
    groups.push({ league: null, teams: allTeams })
  }

  // a league with an odd count (BP: not a multiple of four) gets its own swing teams
  for (const [g, group] of groups.entries()) {
    if (group.teams.length % perRoom && opts.addSwing && group.teams.length >= 1) {
      const missing = perRoom - (group.teams.length % perRoom)
      for (let i = 0; i < missing; i++) group.teams.push({ ...(await swingTeam(tId, i, group.league, leagues.length ? g : 0)), name: '' })
    }
    const n = group.teams.length
    const league = leagues.find(l => l.key === group.league)?.name
    if (n < perRoom) throw badRequest(league ? 'league_not_enough_teams' : 'not_enough_teams', { league: league ?? '' })
    if (perRoom === 2 && n % 2) throw badRequest(league ? 'league_odd_number_of_teams' : 'odd_number_of_teams', { league: league ?? '' })
    if (perRoom === 4 && n % 4) throw badRequest('bp_teams_multiple_of_four', { teams: n })
  }
  // one judge per room: the error says how many are needed and how many there are
  const teamCount = groups.reduce((a, g) => a + g.teams.length, 0)
  const roomsNeeded = teamCount / perRoom
  if (judges.length < roomsNeeded) throw badRequest('not_enough_judges', { need: roomsNeeded, have: judges.length, teams: teamCount })

  const method = opts.method ?? 'power'
  const standings = method === 'random' || round.number === 1 || previous.length === 0 ? null : await getStandings(tId)
  const protectClubs = opts.protectClubs ?? round.number <= CLUB_PROTECTED_ROUNDS
  const pairs: string[][] = []
  const report = { sameClub: 0, rematches: 0 }
  for (const group of groups) {
    const r = drawGroup(group.teams, { method, standings, protectClubs, previous, perRoom, roundNumber: round.number })
    pairs.push(...r.pairs)
    report.sameClub += r.sameClub
    report.rematches += r.rematches
  }

  const leagueOfTeam = new Map(groups.flatMap(g => g.teams.map(t => [t.id, g.league] as const)))
  const clash = withLeagues(await conflictChecker(tId), judges, pairs, leagues.length ? leagueOfTeam : null, leagues)
  const roomNames = roomsFor(pairs, round.tournament.rooms, (round.tournament.roomLeagues ?? {}) as Record<string, string>, leagues.length ? leagueOfTeam : null)
  const judgeConflicts = await seatJudgesAndSave(round, pairs, await rankJudges(tId, judges), null, clash, await seenBy(tId, roundId), roomNames)
  return { method, protectClubs, ...report, judgeConflicts }
}

type DrawTeam = { id: string; institutionId: string | null; clubId: string | null }
type PreviousDebate = { propositionTeamId: string; oppositionTeamId: string; closingPropositionTeamId: string | null; closingOppositionTeamId: string | null }

// The rooms of one group of teams (the whole tournament, or one league): order by the table (round 1 and the random
// method: random order), then pair by the method avoiding rematches and, in protected rounds, clubmates.
function drawGroup(teams: DrawTeam[], o: { method: DrawMethod; standings: Awaited<ReturnType<typeof getStandings>> | null; protectClubs: boolean; previous: PreviousDebate[]; perRoom: number; roundNumber: number }) {
  const { method, standings, protectClubs, previous, perRoom } = o
  let ordered: string[]
  let scoreOf: Map<string, number> | undefined
  if (!standings) {
    ordered = shuffle(teams.map(t => t.id))
  } else {
    const rank = new Map(standings.teams.map((r, i) => [r.team.id, i]))
    scoreOf = new Map(standings.teams.map(r => [r.team.id, r.points]))
    // equal records keep a random order among themselves
    ordered = shuffle(teams.map(t => t.id)).sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999))
  }
  const clubOf = new Map(teams.map(t => [t.id, t.clubId ?? t.institutionId]))
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
    return { pairs: result.rooms.map(room => assignPositions(room, counts)), sameClub: result.sameClub, rematches: 0 }
  }
  const met = new Set(previous.map(p => [p.propositionTeamId, p.oppositionTeamId].sort().join('|')))
  const propCount = new Map<string, number>()
  previous.forEach(p => propCount.set(p.propositionTeamId, (propCount.get(p.propositionTeamId) ?? 0) + 1))
  // round robin: the same team order every round (by when the team was added), round k of the circle
  const robin = method === 'round_robin'
    ? roundRobinPairs([...teams].sort((a, b) => a.id.localeCompare(b.id)).map(t => t.id), o.roundNumber - 1)
    : null
  const result = robin
    ? { pairs: robin, sameClub: 0, rematches: robin.filter(([a, b]) => met.has([a, b].sort().join('|'))).length }
    : pairTeams({ order: ordered, method, met, clubOf, protectClubs, scoreOf })
  // side balance: Proposition to the team that has had it less often
  return {
    pairs: result.pairs.map(([a, b]) => ((propCount.get(a) ?? 0) <= (propCount.get(b) ?? 0) ? [a, b] : [b, a])),
    sameClub: result.sameClub, rematches: result.rematches,
  }
}

// Leagues: a judge with a league sits only in that league's rooms (a judge without one sits anywhere). Before the draw
// each league must have enough judges of its own or of any league; the seating then treats a league mismatch as a
// conflict it never chooses while there is a choice.
function withLeagues(clash: ConflictCheck, judges: { id: string; league: string | null }[], pairs: string[][], leagueOfTeam: Map<string, string | null> | null, leagues: { key: string; name: string }[] = []): ConflictCheck {
  if (!leagueOfTeam) return clash
  const judgeLeague = new Map(judges.map(j => [j.id, j.league]))
  const roomLeague = (room: string[]) => leagueOfTeam.get(room[0]) ?? null
  const rooms = new Map<string, number>()
  for (const room of pairs) { const l = roomLeague(room); if (l) rooms.set(l, (rooms.get(l) ?? 0) + 1) }
  const any = judges.filter(j => !j.league).length
  for (const [league, need] of rooms) {
    const have = judges.filter(j => j.league === league).length + any
    if (have < need) throw badRequest('league_not_enough_judges', { league: leagues.find(l => l.key === league)?.name ?? league, need, have })
  }
  return (judgeId, room) => {
    const jl = judgeLeague.get(judgeId)
    return clash(judgeId, room) || (!!jl && jl !== roomLeague(room))
  }
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
// bracket: the place of each room in the playoff bracket (null for preliminary rounds)
async function seatJudgesAndSave(round: RoundWithTournament, pairs: string[][], judges: JudgeRow[], bracket: number[] | null, clash: ConflictCheck, seen: Seen, roomNames?: string[]) {
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
          roundId, room: roomNames?.[i] ?? roomName(i, round.tournament.rooms), propositionTeamId: pairs[i][0], oppositionTeamId: pairs[i][1],
          closingPropositionTeamId: pairs[i][2] ?? null, closingOppositionTeamId: pairs[i][3] ?? null,
          bracketSlot: bracket ? bracket[i] : null,
          onlineUrl: links[roomNames?.[i] ?? roomName(i, round.tournament.rooms)] ?? null,
          judges: { create: panels[i] },
        },
      })
    }
  })
  return forced
}

// the tournament's stand-in teams (each created once): placeholder speakers so judges can score them; never ranked.
// Two-team formats need at most one ("Swing"), BP up to three ("Swing", "Swing 2", "Swing 3"). With leagues each league
// has its own ("Swing", "Swing B" … by the league's place in the list), kept in that league.
async function swingTeam(tournamentId: string, index = 0, league: string | null = null, leagueIndex = 0) {
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId }, select: { format: true } })
  const suffix = leagueIndex ? ` ${String.fromCharCode(65 + leagueIndex)}` : ''
  const name = (index ? `Swing ${index + 1}` : 'Swing') + suffix
  const existing = await prisma.team.findFirst({ where: { tournamentId, swing: true, name }, select: { id: true, institutionId: true, clubId: true, league: true } })
  if (existing) {
    if (existing.league !== league) await prisma.team.update({ where: { id: existing.id }, data: { league } })
    return { ...existing, league }
  }
  return prisma.team.create({
    data: { tournamentId, name, swing: true, league, speakers: { create: Array.from({ length: rulesOf(t.format).speakers }, (_, i) => ({ name: `Swing ${i + 1}`, position: i + 1 })) } },
    select: { id: true, institutionId: true, clubId: true, league: true },
  })
}
