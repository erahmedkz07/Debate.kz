import type { Prisma, User } from '../generated/prisma/client.js'
import { toDay } from '../lib/dates.js'
import { forbidden, notFound } from '../lib/errors.js'
import { prisma } from '../lib/prisma.js'
import { shortCache } from '../lib/shortCache.js'
import { coverOf } from './covers.js'
import { BP_POINTS, isBP, teamOnSide } from './formats.js'
import { stageOf } from './stages.js'
import { silentIn } from './silent.js'

// ---------- shapes sent to the frontend (match frontend/src/types) ----------

// the swing team (stand-in for an odd draw) never counts toward the team limit
// teams that play (without swing teams) and live applications (everything but rejected)
export const summaryInclude = {
  _count: { select: { teams: { where: { swing: false } }, registrations: { where: { status: { not: 'rejected' } } } } },
} satisfies Prisma.TournamentInclude
type SummaryRow = Prisma.TournamentGetPayload<{ include: typeof summaryInclude }>

export const toSummary = (t: SummaryRow) => ({
  id: t.id, name: t.name, city: t.city, region: t.region ?? undefined, district: t.district ?? undefined, venue: t.venue ?? undefined, startDate: toDay(t.startDate), endDate: toDay(t.endDate),
  format: t.format, level: t.level, status: t.status, teamsCount: t._count.teams, maxTeams: t.maxTeams, applications: t._count.registrations,
  cover: coverOf(t), organizer: t.organizerName, description: t.description,
  preliminaryRounds: t.preliminaryRounds, breakSize: t.breakSize, languages: t.languages,
  breakCategories: t.breakCategories as { key: string; name: string; size: number }[],
  leagues: leaguesOf(t),
})

// with leagues each league may have its own motion and info slide (a Kazakh and a Russian one); else the round's
type LeagueMotions = Record<string, { motion?: string; infoSlide?: string }>
const lm = (r: { leagueMotions?: unknown }) => (r.leagueMotions && typeof r.leagueMotions === 'object' ? r.leagueMotions : {}) as LeagueMotions
export const motionFor = (r: { motion: string; leagueMotions?: unknown }, league?: string | null) => (league && lm(r)[league]?.motion) || r.motion
export const infoSlideFor = (r: { infoSlide: string | null; leagueMotions?: unknown }, league?: string | null) => (league && lm(r)[league]?.infoSlide) || r.infoSlide || undefined

// a league's language: the one the organizer chose, else guessed from its name (Kazakh letters = Kazakh)
type League = { key: string; name: string; breakSize?: number; language?: 'kz' | 'ru' }
const KAZAKH_LETTERS = /[әғқңөұүһі]/i
export const leagueLanguage = (l: Pick<League, 'name' | 'language'>): 'kz' | 'ru' => l.language ?? (KAZAKH_LETTERS.test(l.name) ? 'kz' : 'ru')
// the tournament's leagues ([] when it has none); a Kazakh league always comes first (tabs, tables, brackets, reports)
export const leaguesOf = (t: { leagues: unknown }) => {
  const list = (Array.isArray(t.leagues) ? t.leagues : []) as League[]
  return [...list].sort((a, b) => Number(leagueLanguage(a) !== 'kz') - Number(leagueLanguage(b) !== 'kz'))
}

export const teamInclude = {
  institution: true, speakers: { orderBy: { position: 'asc' } },
  club: { select: { id: true, name: true, logoUrl: true } }, clubTeam: { select: { id: true, name: true, logoUrl: true } },
} satisfies Prisma.TeamInclude
type TeamRow = Prisma.TeamGetPayload<{ include: typeof teamInclude }>

export const toTeam = (t: TeamRow) => ({
  id: t.id, tournamentId: t.tournamentId, name: t.name, institution: t.institution?.name ?? '', city: t.city ?? '',
  // userId: a link to the person's public page (an account that did not hide its profile)
  speakers: t.speakers.map(s => ({ id: s.id, name: s.name, teamId: t.id, ...(s.userId && { userId: s.userId }) })),
  checkedIn: !!t.checkedInAt, swing: t.swing, ...(t.league && { league: t.league }), ...(t.withdrawnAt && { withdrawn: true }),
  club: t.club ? { id: t.club.id, name: t.club.name, logoUrl: t.club.logoUrl ?? undefined } : undefined, // where the team comes from
  clubTeam: t.clubTeam ? { id: t.clubTeam.id, name: t.clubTeam.name } : undefined,
  // the picture shown next to the team: its own club-team logo, else its club's
  logoUrl: t.clubTeam?.logoUrl ?? t.club?.logoUrl ?? undefined,
})

const debateInclude = { judges: { orderBy: { isChair: 'desc' } } } satisfies Prisma.DebateInclude
type DebateRow = Prisma.DebateGetPayload<{ include: typeof debateInclude }>

// withLink: the online room link, for the debate's own people and organizers only (never on the public page)
export const toDebate = (d: DebateRow, withLink = false) => ({
  id: d.id, roundId: d.roundId, room: d.room, propositionTeamId: d.propositionTeamId, oppositionTeamId: d.oppositionTeamId,
  // British Parliamentary: the closing half and the places 1st–4th
  ...(d.closingPropositionTeamId && { closingPropositionTeamId: d.closingPropositionTeamId, closingOppositionTeamId: d.closingOppositionTeamId ?? undefined }),
  ...(d.ranking.length && { ranking: d.ranking }),
  ...(d.bracketSlot !== null && { bracketSlot: d.bracketSlot }),
  judgeIds: d.judges.map(j => j.judgeId), winner: d.winner ?? undefined, ballotStatus: d.ballotStatus,
  ...(d.forfeit && { forfeit: d.forfeit }),
  ...(withLink && d.onlineUrl && { onlineUrl: d.onlineUrl }),
})

// ---------- permissions ----------

// Rights are per tournament: owner / co-organizer links, or a platform admin
export async function organizerLink(user: User | undefined, tournamentId: string) {
  if (!user) return null
  return prisma.tournamentOrganizer.findUnique({ where: { tournamentId_userId: { tournamentId, userId: user.id } } })
}

export async function isOrganizerOf(user: User | undefined, tournamentId: string) {
  if (!user) return false
  if (user.role === 'admin') return true
  return !!(await organizerLink(user, tournamentId))
}

export async function assertCanManage(user: User | undefined, tournamentId: string) {
  const exists = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true } })
  if (!exists) throw notFound('tournament_not_found')
  if (!(await isOrganizerOf(user, tournamentId))) throw forbidden()
}

// Deleting the tournament and inviting co-organizers is for the owner (or an admin) only
export async function assertOwner(user: User | undefined, tournamentId: string) {
  await assertCanManage(user, tournamentId)
  if (user!.role === 'admin') return
  const link = await organizerLink(user, tournamentId)
  if (link?.role !== 'owner') throw forbidden('owner_only')
}

// Public listing: approved by an admin and not hidden
export const publicWhere = { visible: true, moderation: 'approved' as const, abandonedAt: null } // an abandoned tournament is archived
// the same rule for one loaded tournament
export const isPublic = (t: { visible: boolean; moderation: string; abandonedAt: Date | null }) => t.visible && t.moderation === 'approved' && !t.abandonedAt

// One person cannot be both a judge/organizer and a speaker in the same tournament
export async function participationIn(userId: string, tournamentId: string) {
  const [organizer, judge, speaker, registration] = await Promise.all([
    prisma.tournamentOrganizer.findUnique({ where: { tournamentId_userId: { tournamentId, userId } } }),
    prisma.judge.findFirst({ where: { tournamentId, userId } }),
    prisma.speaker.findFirst({ where: { userId, team: { tournamentId } } }),
    prisma.teamRegistration.findFirst({ where: { tournamentId, userId, status: { not: 'rejected' } } }),
  ])
  return { organizer: !!organizer, judge: !!judge, competitor: !!speaker || !!registration }
}

// ---------- details ----------

export async function getTournamentDetails(id: string, viewer?: User) {
  const t = await prisma.tournament.findUnique({
    where: { id },
    include: {
      ...summaryInclude,
      schedule: { orderBy: [{ day: 'asc' }, { time: 'asc' }] },
      rounds: { orderBy: { number: 'asc' }, include: { debates: { include: debateInclude, orderBy: { room: 'asc' } } } },
      teams: { include: teamInclude, orderBy: { createdAt: 'asc' } },
      judges: {
        include: { institution: true, conflicts: { select: { teamId: true } }, user: { select: { clubMembership: { select: { clubId: true } } } } },
        orderBy: [{ rating: 'desc' }, { name: 'asc' }],
      },
      registrations: { where: { status: 'pending' }, select: { id: true } },
      awards: true,
    },
  })
  const manager = await isOrganizerOf(viewer, id)
  if (!t || (!isPublic(t) && !manager)) throw notFound('tournament_not_found')
  const link = manager ? await organizerLink(viewer, id) : null

  // the public never sees unreleased motions or draws
  const rounds = t.rounds.map(r => ({
    id: r.id, tournamentId: r.tournamentId, number: r.number, name: r.name,
    motion: r.status === 'draft' && !manager ? '' : r.motion,
    infoSlide: r.status === 'draft' && !manager ? undefined : r.infoSlide ?? undefined,
    ...((r.status !== 'draft' || manager) && Object.keys(lm(r)).length && { leagueMotions: lm(r) }),
    status: r.status, date: toDay(r.date), ...(r.silent && { silent: true }),
    ...(r.kind === 'elimination' && {
      kind: r.kind, teamsInRound: r.teamsInRound ?? undefined, stage: stageOf(r.teamsInRound ?? 0, isBP(t.format)),
      // a category bracket (novices…): its key and name for the round title
      ...(r.category && { category: r.category, categoryName: [...(t.breakCategories as { key: string; name: string }[]), ...leaguesOf(t)].find(c => c.key === r.category)?.name }),
    }),
  }))
  const silent = manager ? new Set<string>() : silentIn(t)
  const debates = t.rounds.filter(r => manager || r.status !== 'draft').flatMap(r => r.debates.map(d => {
    const x = toDebate(d, manager)
    return silent.has(r.id) ? { ...x, winner: undefined, ranking: undefined } : x
  }))
  const chairIds = new Set(t.rounds.flatMap(r => r.debates.flatMap(d => d.judges.filter(j => j.isChair).map(j => j.judgeId))))

  return {
    ...toSummary(t),
    // organizer-only flags
    ...(manager && {
      visible: t.visible, plan: t.plan, paid: t.paid, moderation: t.moderation, moderationNote: t.moderationNote ?? undefined,
      registrationOpen: t.registrationOpen,
      registrationDeadline: t.registrationDeadline ? toDay(t.registrationDeadline) : undefined,
      rooms: t.rooms, roomLinks: t.roomLinks as Record<string, string>, roomLeagues: (t.roomLeagues ?? {}) as Record<string, string>, pendingRegistrations: t.registrations.length,
      selectionMode: t.selectionMode, clubQuota: t.clubQuota ?? undefined,
      ...(t.drawOptions && { drawOptions: t.drawOptions as Record<string, unknown> }),
      myRole: link?.role ?? (viewer?.role === 'admin' ? 'admin' : undefined),
    }),
    // best speaker / best judge: public once the tournament is finished, organizers see their choice before
    ...((t.status === 'finished' || manager) && t.awards.length && { awards: t.awards.map(a => ({ kind: a.kind, name: a.name })) }),
    // the selection lottery is public: its order is shown on the tournament page
    ...(t.lotteryAt && { lotteryAt: t.lotteryAt.toISOString() }),
    schedule: t.schedule.map(s => ({ day: s.day, time: s.time, title: s.title })),
    rounds, debates,
    teams: t.teams.map(team => ({
      ...toTeam(team), ...(team.breakSeed && { breakSeed: team.breakSeed, ...(team.breakCategory && { breakCategory: team.breakCategory }) }),
      ...(team.categories.length && { categories: team.categories }),
      ...(manager && team.institutionId && { institutionId: team.institutionId }),
    })),
    judges: t.judges.map(j => ({
      id: j.id, tournamentId: j.tournamentId, name: j.name, institution: j.institution?.name ?? '', rating: j.rating, isChair: chairIds.has(j.id),
      hasAccount: !!j.userId, // a judge without an account judges by their personal link
      ...(j.userId && { userId: j.userId }), ...(j.league && { league: j.league }), ...(j.leftAt && { left: true }),
      // organizers: the personal link of a judge without an account
      ...(manager && j.accessKey && { accessKey: j.accessKey }),
      // organizers: conflicts the draw respects (personal ones and the judge's club)
      ...(manager && { conflictTeamIds: j.conflicts.map(c => c.teamId), clubId: j.user?.clubMembership?.clubId ?? undefined, institutionId: j.institutionId ?? undefined }),
    })),
  }
}

// ---------- standings (computed from real ballots) ----------

// the table as visitors see it, kept for a few seconds (lib/shortCache.ts): the public table, speakers' pages and the
// rating read it; organizers' views and every action (draw, break, certificates) compute it fresh with getStandings
const standingsCache = shortCache<Awaited<ReturnType<typeof getStandings>>>(5_000)
export const cachedStandings = (tournamentId: string, hide: Set<string> = new Set()) =>
  standingsCache(`${tournamentId}|${[...hide].sort().join(',')}`, () => getStandings(tournamentId, hide))

// hide: rounds whose results the reader may not see yet (silent rounds, see services/silent.ts)
export async function getStandings(tournamentId: string, hide: Set<string> = new Set()) {
  const [teams, debates] = await Promise.all([
    // swing teams only fill the draw; they are never ranked
    prisma.team.findMany({ where: { tournamentId, swing: false }, include: teamInclude }),
    prisma.debate.findMany({
      // the standings are the preliminary rounds; the playoffs decide the champion separately
      where: { round: { tournamentId, status: 'completed', kind: 'preliminary', id: { notIn: [...hide] } }, winner: { not: null } },
      include: { ballots: { include: { scores: true } } },
    }),
  ])

  const wins = new Map<string, number>(), losses = new Map<string, number>(), points = new Map<string, number>()
  const speakerSum = new Map<string, number>(), speakerRounds = new Map<string, number>()
  const add = (m: Map<string, number>, id: string, n = 1) => m.set(id, (m.get(id) ?? 0) + n)
  // round by round (for the reports): a speaker's score; a team's result, score (the panel's average, replies
  // included) and opponent; a team's total margin over its opponents
  type TeamRound = { result: 'W' | 'L' | number; score: number; opponentId?: string }
  const speakerByRound = new Map<string, Record<string, number>>(), teamByRound = new Map<string, Record<string, TeamRound>>()
  const margins = new Map<string, number>()
  const round1 = (n: number) => Math.round(n * 10) / 10

  for (const d of debates) {
    if (d.ranking.length) {
      // British Parliamentary: 3/2/1/0 team points by place; 1st place counts as a win
      d.ranking.forEach((side, place) => {
        const id = teamOnSide(d, side)
        if (!id) return
        add(points, id, BP_POINTS[place])
        add(place === 0 ? wins : losses, id)
      })
    } else {
      const winnerId = d.winner === 'proposition' ? d.propositionTeamId : d.oppositionTeamId
      const loserId = d.winner === 'proposition' ? d.oppositionTeamId : d.propositionTeamId
      add(wins, winnerId); add(points, winnerId)
      add(losses, loserId)
    }

    // a speaker's score in a debate = average over the panel's ballots (substantive speeches only)
    const perSpeaker = new Map<string, number[]>()
    for (const b of d.ballots) for (const s of b.scores) {
      if (s.position > 3) continue
      perSpeaker.set(s.speakerId, [...(perSpeaker.get(s.speakerId) ?? []), Number(s.score)])
    }
    for (const [speakerId, list] of perSpeaker) {
      const avg = list.reduce((a, c) => a + c, 0) / list.length
      speakerSum.set(speakerId, (speakerSum.get(speakerId) ?? 0) + avg)
      speakerRounds.set(speakerId, (speakerRounds.get(speakerId) ?? 0) + 1)
      speakerByRound.set(speakerId, { ...speakerByRound.get(speakerId), [d.roundId]: round1(avg) })
    }
    // each side's score in this debate: the panel's average of its totals (a technical loss has no ballots)
    const sides = (['proposition', 'opposition', 'closingProposition', 'closingOpposition'] as const).filter(side => teamOnSide(d, side))
    const scoreOf = (side: string) => (d.ballots.length ? d.ballots.reduce((sum, b) => sum + b.scores.filter(x => x.side === side).reduce((a, x) => a + Number(x.score), 0), 0) / d.ballots.length : 0)
    for (const side of sides) {
      const id = teamOnSide(d, side)!
      const place = d.ranking.indexOf(side)
      const opponent = sides.length === 2 ? teamOnSide(d, sides.find(x => x !== side)!) ?? undefined : undefined
      const result: TeamRound['result'] = d.ranking.length ? place + 1 : d.winner === side ? 'W' : 'L'
      teamByRound.set(id, { ...teamByRound.get(id), [d.roundId]: { result, score: round1(scoreOf(side)), ...(opponent && { opponentId: opponent }) } })
      if (sides.length === 2 && d.ballots.length) add(margins, id, scoreOf(side) - scoreOf(sides.find(x => x !== side)!))
    }
  }

  const teamRows = teams.map(team => {
    const sp = team.speakers.reduce((s, x) => s + (speakerSum.get(x.id) ?? 0), 0)
    const w = wins.get(team.id) ?? 0, l = losses.get(team.id) ?? 0
    // points: wins in two-team formats, team points (3/2/1/0) in BP
    return { team: toTeam(team), wins: w, losses: l, points: points.get(team.id) ?? 0, speakerPoints: round1(sp), margins: round1(margins.get(team.id) ?? 0), byRound: teamByRound.get(team.id) ?? {} }
  }).sort((a, b) => b.points - a.points || b.speakerPoints - a.speakerPoints)

  const speakerRows = teams.flatMap(team => team.speakers.map(s => {
    const total = speakerSum.get(s.id) ?? 0, n = speakerRounds.get(s.id) ?? 0
    return { speaker: { id: s.id, name: s.name, teamId: team.id, ...(s.userId && { userId: s.userId }) }, team: toTeam(team), total: round1(total), average: n ? round1(total / n) : 0, rounds: n, byRound: speakerByRound.get(s.id) ?? {} }
  })).sort((a, b) => b.total - a.total)

  return {
    teams: teamRows.map((r, i) => ({ rank: i + 1, ...r })),
    speakers: speakerRows.map((r, i) => ({ rank: i + 1, ...r })),
  }
}

// A personal link (a judge's, a speaker's) is a key: whoever has it acts as that person. It stops working
// LINK_DAYS days after the tournament's last day: enough to send the last ballots, read the results, take the
// certificate and save the results to a profile, while an old link forwarded to a chat stays harmless.
export const LINK_DAYS = 90
export const linkExpired = (t: { endDate: Date }) => Date.now() > t.endDate.getTime() + (LINK_DAYS + 1) * 864e5
