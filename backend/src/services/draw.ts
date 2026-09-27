import { badRequest, forbidden } from '../lib/errors.js'
import { prisma } from '../lib/prisma.js'
import { getStandings } from './tournaments.js'
import { pairTeams, shuffle, type DrawMethod } from './pairing.js'

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
// presentOnly: only teams that checked in; addSwing: an odd number of teams gets the stand-in "swing" team
export interface DrawOptions { presentOnly?: boolean; addSwing?: boolean; method?: DrawMethod; protectClubs?: boolean }
export const CLUB_PROTECTED_ROUNDS = 2 // by default the first two rounds keep clubmates apart

export async function generateDraw(roundId: string, opts: DrawOptions = {}) {
  const round = await prisma.round.findUnique({ where: { id: roundId }, include: { tournament: true } })
  if (!round) throw badRequest('round_not_found')
  if (round.status === 'completed') throw forbidden('round_completed')
  const hasBallots = await prisma.ballot.count({ where: { debate: { roundId } } })
  if (hasBallots) throw forbidden('ballots_already_submitted')

  const tId = round.tournamentId
  const [teams, judges, previous] = await Promise.all([
    prisma.team.findMany({
      where: { tournamentId: tId, swing: false, ...(opts.presentOnly && { checkedInAt: { not: null } }) },
      select: { id: true, institutionId: true, clubId: true },
    }),
    prisma.judge.findMany({ where: { tournamentId: tId }, orderBy: [{ rating: 'desc' }, { name: 'asc' }] }),
    prisma.debate.findMany({ where: { round: { tournamentId: tId, number: { lt: round.number } } }, select: { propositionTeamId: true, oppositionTeamId: true } }),
  ])
  if (teams.length % 2 && opts.addSwing && teams.length >= 1) teams.push(await swingTeam(tId))
  if (teams.length < 2) throw badRequest('not_enough_teams')
  if (teams.length % 2) throw badRequest('odd_number_of_teams')
  // one judge per room: the error says how many are needed and how many there are
  if (judges.length < teams.length / 2) throw badRequest('not_enough_judges', { need: teams.length / 2, have: judges.length, teams: teams.length })

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

  const met = new Set(previous.map(p => [p.propositionTeamId, p.oppositionTeamId].sort().join('|')))
  const propCount = new Map<string, number>()
  previous.forEach(p => propCount.set(p.propositionTeamId, (propCount.get(p.propositionTeamId) ?? 0) + 1))

  const protectClubs = opts.protectClubs ?? round.number <= CLUB_PROTECTED_ROUNDS
  const clubOf = new Map(teams.map(t => [t.id, t.clubId ?? t.institutionId]))
  const result = pairTeams({ order: ordered, method, met, clubOf, protectClubs })
  // side balance: Proposition to the team that has had it less often
  const pairs = result.pairs.map(([a, b]) => ((propCount.get(a) ?? 0) <= (propCount.get(b) ?? 0) ? [a, b] : [b, a]) as [string, string])

  // judge allocation
  const inst = new Map(teams.map(t => [t.id, t.institutionId]))
  const conflictsWith = (judgeInst: string | null, pair: [string, string]) => !!judgeInst && (inst.get(pair[0]) === judgeInst || inst.get(pair[1]) === judgeInst)
  const free = [...judges]
  const takeJudge = (pair: [string, string]) => {
    let i = free.findIndex(j => !conflictsWith(j.institutionId, pair))
    if (i === -1) i = 0
    return free.splice(i, 1)[0]
  }
  const panels = pairs.map(pair => [{ judgeId: takeJudge(pair).id, isChair: true }])
  // spare judges become wings, round-robin over rooms
  for (let r = 0; free.length && r < pairs.length * 2; r++) {
    const room = r % pairs.length
    const j = takeJudge(pairs[room])
    if (j) panels[room].push({ judgeId: j.id, isChair: false })
  }

  await prisma.$transaction(async tx => {
    await tx.debate.deleteMany({ where: { roundId } })
    for (let i = 0; i < pairs.length; i++) {
      await tx.debate.create({
        data: {
          roundId, room: roomName(i, round.tournament.rooms.length ? round.tournament.rooms : ROOMS), propositionTeamId: pairs[i][0], oppositionTeamId: pairs[i][1],
          judges: { create: panels[i] },
        },
      })
    }
  })
  return { method, protectClubs, sameClub: result.sameClub, rematches: result.rematches }
}

// the tournament's stand-in team (created once): three placeholder speakers so judges can score it; never ranked
async function swingTeam(tournamentId: string) {
  const existing = await prisma.team.findFirst({ where: { tournamentId, swing: true }, select: { id: true, institutionId: true, clubId: true } })
  if (existing) return existing
  return prisma.team.create({
    data: { tournamentId, name: 'Swing', swing: true, speakers: { create: [1, 2, 3].map(position => ({ name: `Swing ${position}`, position })) } },
    select: { id: true, institutionId: true, clubId: true },
  })
}
