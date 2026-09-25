import { badRequest, forbidden } from '../lib/errors.js'
import { prisma } from '../lib/prisma.js'
import { getStandings } from './tournaments.js'
import { levelRank, levelsForJudges } from './judgeLevels.js'

const ROOMS = ['Ауд. 101', 'Ауд. 102', 'Ауд. 203', 'Ауд. 204', 'Ауд. 305', 'Актовый зал', 'Ауд. 310', 'Ауд. 412', 'Ауд. 415', 'Библиотека', 'Ауд. 501', 'Ауд. 502']
export const DEFAULT_ROOMS = ROOMS
// the organizer's own rooms first; when they run out, numbered rooms continue
export const roomName = (i: number, rooms: string[] = ROOMS) => rooms[i] ?? `Ауд. ${601 + i - rooms.length}`

// Power-paired WSDC draw:
// 1) teams ordered by wins, then speaker points (round 1: random)
// 2) neighbours meet, skipping rematches when possible
// 3) side goes to the team that has been Proposition less often
// 4) one judge per room: best-rated judges chair, spare judges become wings,
//    a judge never sits on a debate with a team from their own institution
export async function generateDraw(roundId: string) {
  const round = await prisma.round.findUnique({ where: { id: roundId }, include: { tournament: true } })
  if (!round) throw badRequest('round_not_found')
  if (round.status === 'completed') throw forbidden('round_completed')
  const hasBallots = await prisma.ballot.count({ where: { debate: { roundId } } })
  if (hasBallots) throw forbidden('ballots_already_submitted')

  const tId = round.tournamentId
  const [teams, judges, previous] = await Promise.all([
    prisma.team.findMany({ where: { tournamentId: tId }, select: { id: true, institutionId: true } }),
    prisma.judge.findMany({ where: { tournamentId: tId }, orderBy: [{ rating: 'desc' }, { name: 'asc' }] }),
    prisma.debate.findMany({ where: { round: { tournamentId: tId, number: { lt: round.number } } }, select: { propositionTeamId: true, oppositionTeamId: true } }),
  ])
  if (teams.length < 2) throw badRequest('not_enough_teams')
  if (teams.length % 2) throw badRequest('odd_number_of_teams')
  if (judges.length < teams.length / 2) throw badRequest('not_enough_judges')
  // higher-level judges chair first (novices end up as wings when possible); ties keep the organizer's rating order
  const levels = await levelsForJudges(judges)
  const rank = (id: string) => { const l = levels.get(id); return l ? levelRank(l) : 0 }
  judges.sort((a, b) => rank(b.id) - rank(a.id))

  // order teams
  let ordered: string[]
  if (round.number === 1 || previous.length === 0) {
    ordered = teams.map(t => t.id).sort(() => Math.random() - 0.5)
  } else {
    const s = await getStandings(tId)
    const rank = new Map(s.teams.map(r => [r.team.id, r.rank]))
    ordered = teams.map(t => t.id).sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999))
  }

  const met = new Set(previous.map(p => [p.propositionTeamId, p.oppositionTeamId].sort().join('|')))
  const propCount = new Map<string, number>()
  previous.forEach(p => propCount.set(p.propositionTeamId, (propCount.get(p.propositionTeamId) ?? 0) + 1))

  // greedy pairing top-down, avoiding rematches
  const pool = [...ordered]
  const pairs: [string, string][] = []
  while (pool.length) {
    const a = pool.shift()!
    let idx = pool.findIndex(b => !met.has([a, b].sort().join('|')))
    if (idx === -1) idx = 0 // unavoidable rematch
    const b = pool.splice(idx, 1)[0]
    // side balance
    pairs.push((propCount.get(a) ?? 0) <= (propCount.get(b) ?? 0) ? [a, b] : [b, a])
  }

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
}
