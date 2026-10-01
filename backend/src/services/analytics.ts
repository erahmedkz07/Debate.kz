import { prisma } from '../lib/prisma.js'
import { todayKz, toDay } from '../lib/dates.js'
import { regionOfCity } from '../lib/regions.js'

// Platform analytics for the admins: growth, geography, formats, how people come back, how tournaments go.
// Only what the platform already knows from its own work; nothing personal is collected for it (no gender, no age),
// and the numbers are aggregates: no names except clubs, which are public anyway.
// Tournaments count once approved (rejected and pending ones are not the platform's activity yet).

const monthsBack = (n: number) => {
  const [y, m] = todayKz().split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1))
    return d.toISOString().slice(0, 7)
  })
}
const bump = (map: Map<string, number>, key: string | null | undefined, by = 1) => {
  if (key) map.set(key, (map.get(key) ?? 0) + by)
}
const top = (map: Map<string, number>, n = 50) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }))
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)
const share = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

export async function platformAnalytics() {
  const months = monthsBack(12)
  const [users, tournaments, speakers, judges, reviews, strikes, clubs] = await Promise.all([
    prisma.user.findMany({ where: { role: 'user' }, select: { createdAt: true, city: true, telegramChatId: true, clubMembership: { select: { clubId: true } } } }),
    prisma.tournament.findMany({
      where: { moderation: 'approved' },
      select: {
        id: true, startDate: true, status: true, level: true, format: true, region: true, city: true, plan: true, roomLinks: true, abandonedAt: true,
        teams: { where: { swing: false }, select: { clubId: true, _count: { select: { speakers: true } } } },
        _count: { select: { judges: true, registrations: true } },
      },
    }),
    prisma.speaker.findMany({ where: { team: { swing: false, tournament: { moderation: 'approved' } } }, select: { userId: true, team: { select: { tournamentId: true } } } }),
    prisma.judge.findMany({ where: { tournament: { moderation: 'approved' } }, select: { userId: true, tournamentId: true } }),
    prisma.tournamentReview.findMany({ select: { score: true } }),
    prisma.organizerStrike.count({ where: { liftedAt: null } }),
    prisma.club.findMany({ where: { status: 'approved' }, select: { id: true, name: true, city: true, _count: { select: { members: true, tournamentTeams: true } } } }),
  ])

  // ---- growth by month: new accounts, tournaments (by start date), teams and speakers in them ----
  const growth = new Map(months.map(m => [m, { month: m, users: 0, tournaments: 0, teams: 0, speakers: 0 }]))
  for (const u of users) {
    const g = growth.get(toDay(u.createdAt).slice(0, 7))
    if (g) g.users++
  }
  for (const t of tournaments) {
    const g = growth.get(toDay(t.startDate).slice(0, 7))
    if (!g) continue
    g.tournaments++
    g.teams += t.teams.length
    g.speakers += t.teams.reduce((a, x) => a + x._count.speakers, 0)
  }

  // ---- tournaments: status, level, format, online, plan, region ----
  const byStatus = new Map<string, number>(), byLevel = new Map<string, number>(), byFormat = new Map<string, number>()
  const byRegion = new Map<string, { tournaments: number; teams: number }>()
  let online = 0, pro = 0
  for (const t of tournaments) {
    bump(byStatus, t.abandonedAt ? 'abandoned' : t.status)
    bump(byLevel, t.level)
    bump(byFormat, t.format)
    if (Object.keys((t.roomLinks ?? {}) as object).length) online++
    if (t.plan === 'pro') pro++
    const region = t.region ?? regionOfCity(t.city) ?? 'other'
    const r = byRegion.get(region) ?? { tournaments: 0, teams: 0 }
    r.tournaments++
    r.teams += t.teams.length
    byRegion.set(region, r)
  }
  const usersByRegion = new Map<string, number>()
  for (const u of users) bump(usersByRegion, u.city ? regionOfCity(u.city) ?? 'other' : 'unknown')

  // ---- people: how many take part, and how many come back for a second tournament ----
  const perPerson = new Map<string, Set<string>>() // account -> tournaments (as a speaker or a judge)
  for (const s of speakers) if (s.userId) perPerson.set(s.userId, (perPerson.get(s.userId) ?? new Set()).add(s.team.tournamentId))
  for (const j of judges) if (j.userId) perPerson.set(j.userId, (perPerson.get(j.userId) ?? new Set()).add(j.tournamentId))
  const active = perPerson.size
  const returning = [...perPerson.values()].filter(x => x.size >= 2).length

  // ---- tournaments that went to the end ----
  const past = tournaments.filter(t => t.status === 'finished' || t.abandonedAt)
  const finished = past.filter(t => t.status === 'finished').length
  const sizes = tournaments.filter(t => t.teams.length).map(t => t.teams.length)
  const demand = tournaments.filter(t => t._count.registrations).map(t => t._count.registrations)

  return {
    months: [...growth.values()],
    totals: {
      users: users.length, tournaments: tournaments.length, teams: tournaments.reduce((a, t) => a + t.teams.length, 0),
      speakerSlots: speakers.length, judgeSlots: judges.length, clubs: clubs.length,
      inClubs: share(users.filter(u => u.clubMembership).length, users.length),
      telegram: share(users.filter(u => u.telegramChatId).length, users.length),
    },
    tournaments: {
      byStatus: top(byStatus), byLevel: top(byLevel), byFormat: top(byFormat),
      online, pro, averageTeams: avg(sizes), averageApplications: avg(demand),
      completion: past.length ? share(finished, past.length) : null, activeStrikes: strikes,
    },
    regions: [...byRegion.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.teams - a.teams || b.tournaments - a.tournaments),
    usersByRegion: top(usersByRegion),
    people: {
      active, returning, returningShare: share(returning, active),
      // speaker slots without an account: people the organizer typed in by hand
      withoutAccount: share(speakers.filter(s => !s.userId).length + judges.filter(j => !j.userId).length, speakers.length + judges.length),
    },
    quality: { reviews: reviews.length, rating: avg(reviews.map(r => r.score)) },
    topClubs: clubs.filter(c => c._count.tournamentTeams > 0)
      .sort((a, b) => b._count.tournamentTeams - a._count.tournamentTeams).slice(0, 10)
      .map(c => ({ id: c.id, name: c.name, city: c.city, members: c._count.members, entries: c._count.tournamentTeams })),
  }
}
