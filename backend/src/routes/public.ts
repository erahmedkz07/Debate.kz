import path from 'node:path'
import { Router } from 'express'
import sharp from 'sharp'
import { z } from 'zod'
import type { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { body, param, query } from '../middleware/validate.js'
import { cachedStandings, getStandings, getTournamentDetails, isOrganizerOf, isPublic, publicWhere, summaryInclude, toSummary } from '../services/tournaments.js'
import { getBracket } from '../services/playoffs.js'
import { notFound } from '../lib/errors.js'
import rateLimit from 'express-rate-limit'
import { logError } from '../services/errorLog.js'
import { env } from '../lib/env.js'
import { shortCache } from '../lib/shortCache.js'
import { toDay } from '../lib/dates.js'
import { COVERS_DIR, coverOf, isAllowedCover } from '../services/covers.js'
import { hiddenRoundIds } from '../services/silent.js'
import { selectionOf } from '../services/selection.js'
import { publicProfile, speakerInTournament } from '../services/people.js'
import { rowLevel, type Level } from '../lib/levels.js'

export const publicRouter = Router()

const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  city: z.string().max(60).optional(),
  region: z.string().max(30).optional(),
  level: z.enum(['all', 'school', 'university', 'mixed']).optional(),
  status: z.enum(['all', 'registration', 'ongoing', 'finished']).optional(),
  sort: z.enum(['date-asc', 'date-desc', 'teams']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

const statusRank = { ongoing: 0, registration: 1, finished: 2 } as const

// the list is the same for everyone with the same filters: kept for a few seconds (the home page opens it)
const listCache = shortCache<ReturnType<typeof toSummary>[]>(5_000)
publicRouter.get('/tournaments', async (req, res) => {
  const f = query(req, listSchema)
  res.json(await listCache(JSON.stringify(f), () => listTournaments(f)))
})

async function listTournaments(f: z.infer<typeof listSchema>) {
  const where: Prisma.TournamentWhereInput = {
    ...publicWhere,
    ...(f.search && { OR: [{ name: { contains: f.search, mode: 'insensitive' } }, { organizerName: { contains: f.search, mode: 'insensitive' } }] }),
    ...(f.city && f.city !== 'all' && { city: f.city }),
    ...(f.region && f.region !== 'all' && { region: f.region }),
    ...(f.level && f.level !== 'all' && { level: { in: [f.level, 'mixed' as const] } }),
    ...(f.status && f.status !== 'all' && { status: f.status }),
  }
  const rows = await prisma.tournament.findMany({ where, include: summaryInclude, orderBy: { startDate: f.sort === 'date-desc' ? 'desc' : 'asc' } })
  let list = rows.map(toSummary)
  // "nearest first": live and upcoming by date, finished at the end
  if (f.sort === 'teams') list.sort((a, b) => b.teamsCount - a.teamsCount)
  else if (f.sort !== 'date-desc') list.sort((a, b) => statusRank[a.status] - statusRank[b.status] || a.startDate.localeCompare(b.startDate))
  if (f.limit) list = list.slice(0, f.limit)
  return list
}

// organizers get their own, fresh view; everyone else the same public one, kept for a few seconds (lib/shortCache.ts)
const detailsCache = shortCache<Awaited<ReturnType<typeof getTournamentDetails>>>(5_000)
publicRouter.get('/tournaments/:id', async (req, res) => {
  const id = param(req, 'id')
  if (await isOrganizerOf(req.user, id)) return void res.json(await getTournamentDetails(id, req.user))
  res.json(await detailsCache(id, () => getTournamentDetails(id)))
})

// every speaker's page in a tournament (an account is not needed); the same for everyone, kept for a few seconds
const speakerCache = shortCache<Awaited<ReturnType<typeof speakerInTournament>>>(5_000)
publicRouter.get('/tournaments/:id/speakers/:speakerId', async (req, res) => {
  const [id, speakerId] = [param(req, 'id'), param(req, 'speakerId')]
  res.json(await speakerCache(`${id}|${speakerId}`, () => speakerInTournament(id, speakerId)))
})

// The public table of a tournament is recomputed from the ballots: kept for a few seconds per tournament, so the
// crowd opening it after a round (a whole hall at once) costs one computation. Organizers always get it fresh.
const assertPublicTournament = async (id: string) => {
  const t = await prisma.tournament.findUnique({ where: { id }, select: { visible: true, moderation: true, abandonedAt: true } })
  if (!t || !isPublic(t)) throw notFound('tournament_not_found')
}
const tableCache = shortCache<Awaited<ReturnType<typeof getStandings>>>(5_000)
publicRouter.get('/tournaments/:id/standings', async (req, res) => {
  const id = param(req, 'id')
  // silent rounds stay out of the public table until the break; organizers see the real one
  if (await isOrganizerOf(req.user, id)) {
    await assertPublicTournament(id)
    return void res.json(await getStandings(id, new Set()))
  }
  res.json(await tableCache(id, async () => { await assertPublicTournament(id); return cachedStandings(id, await hiddenRoundIds(id)) }))
})

// Sharing a tournament in WhatsApp or Telegram: their link previews read the page's HTML, which the site builds with
// scripts, so the share link points here: a tiny page with the tournament's title, dates, city and cover for the
// preview, which sends a person straight on to the tournament page.
const esc = (v: string) => v.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
publicRouter.get('/share/t/:id', async (req, res) => {
  const t = await prisma.tournament.findUnique({ where: { id: param(req, 'id') } })
  const site = env.CLIENT_ORIGIN.replace(/\/$/, '')
  if (!t || !isPublic(t)) return void res.redirect(302, `${site}/tournaments`)
  const target = `${site}/tournaments/${t.id}`
  // an uploaded cover is WebP, which WhatsApp's preview may not show: it gets a JPEG copy (below); a template photo is
  // asked from Unsplash as JPEG
  const cover = coverOf(t)
  const image = cover.startsWith('http') ? cover.replace('auto=format', 'fm=jpg') : `${site}/api/share/t/${t.id}/cover.jpg`
  const dmy = (d: Date) => toDay(d).split('-').reverse().join('.')
  const dates = toDay(t.startDate) === toDay(t.endDate) ? dmy(t.startDate) : `${dmy(t.startDate)} – ${dmy(t.endDate)}`
  // the description without its formatting, short
  const about = (t.description ?? '').replace(/<[^>]*>/g, ' ').replace(/[#*_>`\[\]()]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180)
  const desc = [`${t.city} · ${dates}`, about].filter(Boolean).join(' — ')
  res.set('Cache-Control', 'public, max-age=300').type('html').send(`<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>${esc(t.name)} — Debate.kz</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Debate.kz">
<meta property="og:title" content="${esc(t.name)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}"><meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:url" content="${esc(target)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=${esc(target)}"><link rel="canonical" href="${esc(target)}">
</head><body><a href="${esc(target)}">${esc(t.name)}</a><script>location.replace(${JSON.stringify(target)})</script></body></html>`)
})

// the uploaded cover of a public tournament as a 1200×630 JPEG for link previews (cached by the messengers for a day)
publicRouter.get('/share/t/:id/cover.jpg', async (req, res) => {
  const t = await prisma.tournament.findUnique({ where: { id: param(req, 'id') } })
  if (!t || !isPublic(t) || !t.coverUrl || !isAllowedCover(t.coverUrl) || t.coverUrl.startsWith('http')) throw notFound('cover_not_found')
  const jpg = await sharp(path.join(COVERS_DIR, path.basename(t.coverUrl))).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    .catch(() => { throw notFound('cover_not_found') })
  res.set('Cache-Control', 'public, max-age=86400').type('jpeg').send(jpg)
})

// a crash on a visitor's page (the page reports it itself): written down like a server error
const clientErrorLimit = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'too_many_requests' } })
publicRouter.post('/client-errors', clientErrorLimit, async (req, res) => {
  const d = body(req, z.object({ message: z.string().max(500), stack: z.string().max(4000).optional(), path: z.string().max(300).optional() }))
  await logError({ source: 'client', message: d.message, stack: d.stack, path: d.path?.split('?')[0], ua: req.get('user-agent')?.slice(0, 200) })
  res.status(204).end()
})

// a person's public page: the career as a speaker and a judge, the awards (404 when the profile is hidden)
publicRouter.get('/people/:id', async (req, res) => {
  res.json(await publicProfile(param(req, 'id')))
})

// selection: how many applied for how many places, and the lottery order after the draw
publicRouter.get('/tournaments/:id/selection', async (req, res) => {
  const id = param(req, 'id')
  const t = await prisma.tournament.findUnique({ where: { id }, select: { visible: true, moderation: true, abandonedAt: true } })
  if (!t || (!isPublic(t) && !(await isOrganizerOf(req.user, id)))) throw notFound('tournament_not_found')
  res.json(await selectionOf(id))
})

// the playoffs: seeds, elimination rounds and, after the final, the champion (the public one kept for a few seconds)
const bracketCache = shortCache<Awaited<ReturnType<typeof getBracket>>>(5_000)
publicRouter.get('/tournaments/:id/bracket', async (req, res) => {
  const id = param(req, 'id')
  if (await isOrganizerOf(req.user, id)) {
    if (!(await prisma.tournament.findUnique({ where: { id }, select: { id: true } }))) throw notFound('tournament_not_found')
    return void res.json(await getBracket(id, true))
  }
  res.json(await bracketCache(id, async () => { await assertPublicTournament(id); return getBracket(id, false) }))
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
// the rating is recomputed from every public tournament's tables: kept for a minute, so a busy page (a whole class
// opening it at once) costs one computation instead of one per visitor
let ratingCache: { at: number; data: unknown } | null = null
const RATING_TTL_MS = process.env.NODE_ENV === 'test' ? 0 : 60_000 // the e2e checks read it right after a change
publicRouter.get('/rating', async (_req, res) => {
  if (ratingCache && Date.now() - ratingCache.at < RATING_TTL_MS) return void res.json(ratingCache.data)
  const tournaments = await prisma.tournament.findMany({ where: publicWhere, select: { id: true, level: true, city: true, startDate: true } })
  type Ref = { id: string; name: string } | undefined
  // teams: the same club team is one row across tournaments even if it entered under different names
  const teamAgg = new Map<string, { name: string; institution: string; club: Ref; logoUrl?: string; city: string; level: Level; tournaments: Set<string>; wins: number; points: number }>()
  // a speaker links to their account's page, or else to their page in the latest tournament they played
  const speakerAgg = new Map<string, { name: string; team: string; club: Ref; city: string; level: Level; tournaments: Set<string>; total: number; n: number; userId?: string; last: { tournamentId: string; speakerId: string; date: string } }>()
  const clubAgg = new Map<string, { club: { id: string; name: string; logoUrl?: string }; city: string; levels: Set<Level>; tournaments: Set<string>; teams: Set<string>; wins: number; debates: number; points: number; speakerAvg: number[] }>()

  for (const t of tournaments) {
    const s = await getStandings(t.id, await hiddenRoundIds(t.id))
    for (const row of s.teams) {
      if (row.wins + row.losses === 0) continue
      const tm = row.team
      const key = tm.clubTeam ? `ct:${tm.clubTeam.id}` : `${tm.name}|${tm.institution}`
      const a = teamAgg.get(key) ?? { name: tm.clubTeam?.name ?? tm.name, institution: tm.institution, club: tm.club, logoUrl: tm.logoUrl, city: tm.city || t.city, level: rowLevel(tm.institution, t.level), tournaments: new Set(), wins: 0, points: 0 }
      a.tournaments.add(t.id); a.wins += row.wins; a.points += row.speakerPoints
      teamAgg.set(key, a)
      if (tm.club) {
        const c = clubAgg.get(tm.club.id) ?? { club: tm.club, city: tm.city || t.city, levels: new Set(), tournaments: new Set(), teams: new Set(), wins: 0, debates: 0, points: 0, speakerAvg: [] }
        c.levels.add(rowLevel(tm.institution, t.level)); c.tournaments.add(t.id); c.teams.add(tm.clubTeam?.id ?? tm.id)
        c.wins += row.wins; c.debates += row.wins + row.losses; c.points += row.speakerPoints
        clubAgg.set(tm.club.id, c)
      }
    }
    for (const row of s.speakers) {
      // the speaker rating is for people with an account (one row per person): names typed by an organizer
      // ("Сабина", "Спикер 1") stay in their tournament's tables until the speaker saves them to a profile
      if (!row.average || !row.speaker.userId) continue
      const key = row.speaker.userId
      const date = t.startDate.toISOString()
      const a = speakerAgg.get(key) ?? { name: row.speaker.name, team: row.team.clubTeam?.name ?? row.team.name, club: row.team.club, city: row.team.city || t.city, level: rowLevel(row.team.institution, t.level), tournaments: new Set(), total: 0, n: 0, last: { tournamentId: t.id, speakerId: row.speaker.id, date } }
      a.tournaments.add(t.id); a.total += row.average; a.n += 1
      a.userId ??= row.speaker.userId
      if (date > a.last.date) a.last = { tournamentId: t.id, speakerId: row.speaker.id, date }
      speakerAgg.set(key, a)
      if (row.team.club) clubAgg.get(row.team.club.id)?.speakerAvg.push(row.average)
    }
  }

  const r1 = (n: number) => Math.round(n * 10) / 10
  const teams = [...teamAgg.values()].sort((a, b) => b.points - a.points).slice(0, 50)
    .map((a, i) => ({ rank: i + 1, name: a.name, institution: a.institution, club: a.club, logoUrl: a.logoUrl, city: a.city, level: a.level, tournaments: a.tournaments.size, wins: a.wins, points: Math.round(a.points) }))
  const speakers = [...speakerAgg.values()].map(a => ({ ...a, average: a.total / a.n })).sort((a, b) => b.average - a.average).slice(0, 50)
    .map((a, i) => ({
      rank: i + 1, name: a.name, team: a.team, club: a.club, city: a.city, level: a.level, tournaments: a.tournaments.size, average: r1(a.average),
      ...(a.userId && { userId: a.userId }), last: { tournamentId: a.last.tournamentId, speakerId: a.last.speakerId },
    }))
  // clubs: by wins, then speaker points; a club that plays both school and university events is "mixed"
  const clubs = [...clubAgg.values()].sort((a, b) => b.wins - a.wins || b.points - a.points).slice(0, 50)
    .map((c, i) => ({
      rank: i + 1, id: c.club.id, name: c.club.name, logoUrl: c.club.logoUrl, city: c.city, level: c.levels.size > 1 ? 'mixed' : [...c.levels][0],
      tournaments: c.tournaments.size, teams: c.teams.size, wins: c.wins, debates: c.debates,
      winRate: c.debates ? Math.round((c.wins / c.debates) * 100) : 0, points: Math.round(c.points),
      speakerAverage: c.speakerAvg.length ? r1(c.speakerAvg.reduce((x, y) => x + y, 0) / c.speakerAvg.length) : 0,
    }))
  ratingCache = { at: Date.now(), data: { teams, speakers, clubs } }
  res.json(ratingCache.data)
})
