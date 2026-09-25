import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { param, query } from '../middleware/validate.js'
import { getStandings, getTournamentDetails, publicWhere, summaryInclude, toSummary } from '../services/tournaments.js'
import { notFound } from '../lib/errors.js'

export const publicRouter = Router()

const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  city: z.string().max(60).optional(),
  level: z.enum(['all', 'school', 'university']).optional(),
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
    ...(f.level && f.level !== 'all' && { level: f.level }),
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
  res.json(await getStandings(param(req, 'id')))
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
  const teamAgg = new Map<string, { name: string; institution: string; city: string; level: 'school' | 'university'; tournaments: Set<string>; wins: number; points: number }>()
  const speakerAgg = new Map<string, { name: string; team: string; city: string; level: 'school' | 'university'; tournaments: Set<string>; total: number; n: number }>()

  for (const t of tournaments) {
    const s = await getStandings(t.id)
    for (const row of s.teams) {
      if (row.wins + row.losses === 0) continue
      const key = `${row.team.name}|${row.team.institution}`
      const a = teamAgg.get(key) ?? { name: row.team.name, institution: row.team.institution, city: row.team.city || t.city, level: t.level, tournaments: new Set(), wins: 0, points: 0 }
      a.tournaments.add(t.id); a.wins += row.wins; a.points += row.speakerPoints
      teamAgg.set(key, a)
    }
    for (const row of s.speakers) {
      if (!row.average) continue
      const key = `${row.speaker.name}|${row.team.institution}`
      const a = speakerAgg.get(key) ?? { name: row.speaker.name, team: row.team.name, city: row.team.city || t.city, level: t.level, tournaments: new Set(), total: 0, n: 0 }
      a.tournaments.add(t.id); a.total += row.average; a.n += 1
      speakerAgg.set(key, a)
    }
  }

  const teams = [...teamAgg.values()].sort((a, b) => b.points - a.points).slice(0, 50)
    .map((a, i) => ({ rank: i + 1, name: a.name, institution: a.institution, city: a.city, level: a.level, tournaments: a.tournaments.size, wins: a.wins, points: Math.round(a.points) }))
  const speakers = [...speakerAgg.values()].map(a => ({ ...a, average: a.total / a.n })).sort((a, b) => b.average - a.average).slice(0, 50)
    .map((a, i) => ({ rank: i + 1, name: a.name, team: a.team, city: a.city, level: a.level, tournaments: a.tournaments.size, average: Math.round(a.average * 10) / 10 }))
  res.json({ teams, speakers })
})
