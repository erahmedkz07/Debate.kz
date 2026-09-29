import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { param, query } from '../middleware/validate.js'
import { getStandings, getTournamentDetails, isOrganizerOf, publicWhere, summaryInclude, toSummary } from '../services/tournaments.js'
import { getBracket } from '../services/playoffs.js'
import { notFound } from '../lib/errors.js'
import { hiddenRoundIds } from '../services/silent.js'

export const publicRouter = Router()

const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  city: z.string().max(60).optional(),
  level: z.enum(['all', 'school', 'university', 'mixed']).optional(),
  status: z.enum(['all', 'registration', 'ongoing', 'finished']).optional(),
  sort: z.enum(['date-asc', 'date-desc', 'teams']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

const statusRank = { ongoing: 0, registration: 1, finished: 2 } as const

publicRouter.get('/tournaments', async (req, res) => {
  const f = query(req, listSchema)
  const where: Prisma.TournamentWhereInput = {
    ...publicWhere,
    ...(f.search && { OR: [{ name: { contains: f.search, mode: 'insensitive' } }, { organizerName: { contains: f.search, mode: 'insensitive' } }] }),
    ...(f.city && f.city !== 'all' && { city: f.city }),
    ...(f.level && f.level !== 'all' && { level: { in: [f.level, 'mixed' as const] } }),
    ...(f.status && f.status !== 'all' && { status: f.status }),
  }
  const rows = await prisma.tournament.findMany({ where, include: summaryInclude, orderBy: { startDate: f.sort === 'date-desc' ? 'desc' : 'asc' } })
  let list = rows.map(toSummary)
  // "nearest first": live and upcoming by date, finished at the end
  if (f.sort === 'teams') list.sort((a, b) => b.teamsCount - a.teamsCount)
  else if (f.sort !== 'date-desc') list.sort((a, b) => statusRank[a.status] - statusRank[b.status] || a.startDate.localeCompare(b.startDate))
  if (f.limit) list = list.slice(0, f.limit)
  res.json(list)
})

publicRouter.get('/tournaments/:id', async (req, res) => {
  res.json(await getTournamentDetails(param(req, 'id'), req.user))
})

publicRouter.get('/tournaments/:id/standings', async (req, res) => {
  const t = await prisma.tournament.findUnique({ where: { id: param(req, 'id') }, select: { visible: true, moderation: true } })
  if (!t?.visible || t.moderation !== 'approved') throw notFound('tournament_not_found')
  // silent rounds stay out of the public table until the break; organizers see the real one
  const id = param(req, 'id')
  res.json(await getStandings(id, (await isOrganizerOf(req.user, id)) ? new Set() : await hiddenRoundIds(id)))
})

// the playoffs: seeds, elimination rounds and, after the final, the champion
publicRouter.get('/tournaments/:id/bracket', async (req, res) => {
  const id = param(req, 'id')
  const t = await prisma.tournament.findUnique({ where: { id }, select: { visible: true, moderation: true } })
  const manager = await isOrganizerOf(req.user, id)
  if (!t || ((!t.visible || t.moderation !== 'approved') && !manager)) throw notFound('tournament_not_found')
  res.json(await getBracket(id, manager))
})

publicRouter.get('/cities', async (_req, res) => {
  const rows = await prisma.tournament.findMany({ where: publicWhere, distinct: ['city'], select: { city: true }, orderBy: { city: 'asc' } })
  res.json(rows.map(r => r.city))
})

publicRouter.get('/stats', async (_req, res) => {
  const [tournaments, teams, debaters, cities] = await Promise.all([
    prisma.tournament.count({ where: publicWhere }),
    prisma.team.count(),
    prisma.speaker.count(),
    prisma.tournament.findMany({ where: publicWhere, distinct: ['city'], select: { city: true } }),
  ])
  res.json({ tournaments, teams, debaters, cities: cities.length })
})

// Live round for the home page hero.
// Signed-in user: the running round of a tournament where they speak, judge or organize.
// Everyone else: the latest running round on the platform. null when nothing is running.
publicRouter.get('/live', async (req, res) => {
  const running = { status: 'released' as const, tournament: { status: 'ongoing' as const, ...publicWhere } }
  const pick = { include: { tournament: true, debates: { select: { ballotStatus: true } } }, orderBy: [{ date: 'desc' as const }, { number: 'desc' as const }] }

  let round = null
  let personal = false
  if (req.user) {
    const uid = req.user.id
    round = await prisma.round.findFirst({
      ...pick,
      where: {
        ...running,
        tournament: {
          ...running.tournament,
          OR: [
            { teams: { some: { speakers: { some: { userId: uid } } } } },
            { judges: { some: { userId: uid } } },
            { organizers: { some: { userId: uid } } },
          ],
        },
      },
    })
    personal = !!round
  }
  round ??= await prisma.round.findFirst({ ...pick, where: running })
  if (!round) return void res.json(null)

  res.json({
    personal,
    tournament: { id: round.tournament.id, name: round.tournament.name },
    round: { number: round.number, motion: round.motion },
    ballots: { submitted: round.debates.filter(d => d.ballotStatus !== 'pending').length, total: round.debates.length },
  })
})

publicRouter.get('/testimonials', async (_req, res) => {
  res.json(await prisma.testimonial.findMany({ orderBy: { order: 'asc' }, select: { name: true, role: true, text: true } }))
})

// Season rating: aggregates results of all tournaments by team name + institution
publicRouter.get('/rating', async (_req, res) => {
  const tournaments = await prisma.tournament.findMany({ where: publicWhere, select: { id: true, level: true, city: true } })
  type Level = 'school' | 'university' | 'mixed'
  type Ref = { id: string; name: string } | undefined
  // teams: the same club team is one row across tournaments even if it entered under different names
  const teamAgg = new Map<string, { name: string; institution: string; club: Ref; logoUrl?: string; city: string; level: Level; tournaments: Set<string>; wins: number; points: number }>()
  const speakerAgg = new Map<string, { name: string; team: string; club: Ref; city: string; level: Level; tournaments: Set<string>; total: number; n: number }>()
  const clubAgg = new Map<string, { club: { id: string; name: string; logoUrl?: string }; city: string; levels: Set<Level>; tournaments: Set<string>; teams: Set<string>; wins: number; debates: number; points: number; speakerAvg: number[] }>()

  for (const t of tournaments) {
    const s = await getStandings(t.id, await hiddenRoundIds(t.id))
    for (const row of s.teams) {
      if (row.wins + row.losses === 0) continue
      const tm = row.team
      const key = tm.clubTeam ? `ct:${tm.clubTeam.id}` : `${tm.name}|${tm.institution}`
      const a = teamAgg.get(key) ?? { name: tm.clubTeam?.name ?? tm.name, institution: tm.institution, club: tm.club, logoUrl: tm.logoUrl, city: tm.city || t.city, level: t.level, tournaments: new Set(), wins: 0, points: 0 }
      a.tournaments.add(t.id); a.wins += row.wins; a.points += row.speakerPoints
      teamAgg.set(key, a)
      if (tm.club) {
        const c = clubAgg.get(tm.club.id) ?? { club: tm.club, city: tm.city || t.city, levels: new Set(), tournaments: new Set(), teams: new Set(), wins: 0, debates: 0, points: 0, speakerAvg: [] }
        c.levels.add(t.level); c.tournaments.add(t.id); c.teams.add(tm.clubTeam?.id ?? tm.id)
        c.wins += row.wins; c.debates += row.wins + row.losses; c.points += row.speakerPoints
        clubAgg.set(tm.club.id, c)
      }
    }
    for (const row of s.speakers) {
      if (!row.average) continue
      const key = `${row.speaker.name}|${row.team.club?.id ?? row.team.institution}`
      const a = speakerAgg.get(key) ?? { name: row.speaker.name, team: row.team.clubTeam?.name ?? row.team.name, club: row.team.club, city: row.team.city || t.city, level: t.level, tournaments: new Set(), total: 0, n: 0 }
      a.tournaments.add(t.id); a.total += row.average; a.n += 1
      speakerAgg.set(key, a)
      if (row.team.club) clubAgg.get(row.team.club.id)?.speakerAvg.push(row.average)
    }
  }

  const r1 = (n: number) => Math.round(n * 10) / 10
  const teams = [...teamAgg.values()].sort((a, b) => b.points - a.points).slice(0, 50)
    .map((a, i) => ({ rank: i + 1, name: a.name, institution: a.institution, club: a.club, logoUrl: a.logoUrl, city: a.city, level: a.level, tournaments: a.tournaments.size, wins: a.wins, points: Math.round(a.points) }))
  const speakers = [...speakerAgg.values()].map(a => ({ ...a, average: a.total / a.n })).sort((a, b) => b.average - a.average).slice(0, 50)
    .map((a, i) => ({ rank: i + 1, name: a.name, team: a.team, club: a.club, city: a.city, level: a.level, tournaments: a.tournaments.size, average: r1(a.average) }))
  // clubs: by wins, then speaker points; a club that plays both school and university events is "mixed"
  const clubs = [...clubAgg.values()].sort((a, b) => b.wins - a.wins || b.points - a.points).slice(0, 50)
    .map((c, i) => ({
      rank: i + 1, id: c.club.id, name: c.club.name, logoUrl: c.club.logoUrl, city: c.city, level: c.levels.size > 1 ? 'mixed' : [...c.levels][0],
      tournaments: c.tournaments.size, teams: c.teams.size, wins: c.wins, debates: c.debates,
      winRate: c.debates ? Math.round((c.wins / c.debates) * 100) : 0, points: Math.round(c.points),
      speakerAverage: c.speakerAvg.length ? r1(c.speakerAvg.reduce((x, y) => x + y, 0) / c.speakerAvg.length) : 0,
    }))
  res.json({ teams, speakers, clubs })
})
