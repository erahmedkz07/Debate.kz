import type { Prisma, User } from '../generated/prisma/client.js'
import { toDay } from '../lib/dates.js'
import { forbidden, notFound } from '../lib/errors.js'
import { prisma } from '../lib/prisma.js'

// ---------- shapes sent to the frontend (match frontend/src/types) ----------

export const summaryInclude = { _count: { select: { teams: true } } } satisfies Prisma.TournamentInclude
type SummaryRow = Prisma.TournamentGetPayload<{ include: typeof summaryInclude }>

export const toSummary = (t: SummaryRow) => ({
  id: t.id, name: t.name, city: t.city, startDate: toDay(t.startDate), endDate: toDay(t.endDate),
  format: t.format, level: t.level, status: t.status, teamsCount: t._count.teams, maxTeams: t.maxTeams,
  cover: t.coverUrl ?? '', organizer: t.organizerName, description: t.description,
  preliminaryRounds: t.preliminaryRounds, breakSize: t.breakSize, languages: t.languages,
})

const teamInclude = { institution: true, speakers: { orderBy: { position: 'asc' } } } satisfies Prisma.TeamInclude
type TeamRow = Prisma.TeamGetPayload<{ include: typeof teamInclude }>

export const toTeam = (t: TeamRow) => ({
  id: t.id, tournamentId: t.tournamentId, name: t.name, institution: t.institution?.name ?? '', city: t.city ?? '',
  speakers: t.speakers.map(s => ({ id: s.id, name: s.name, teamId: t.id })),
})

const debateInclude = { judges: { orderBy: { isChair: 'desc' } } } satisfies Prisma.DebateInclude
type DebateRow = Prisma.DebateGetPayload<{ include: typeof debateInclude }>

export const toDebate = (d: DebateRow) => ({
  id: d.id, roundId: d.roundId, room: d.room, propositionTeamId: d.propositionTeamId, oppositionTeamId: d.oppositionTeamId,
  judgeIds: d.judges.map(j => j.judgeId), winner: d.winner ?? undefined, ballotStatus: d.ballotStatus,
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
export const publicWhere = { visible: true, moderation: 'approved' as const }

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
      judges: { include: { institution: true }, orderBy: [{ rating: 'desc' }, { name: 'asc' }] },
    },
  })
  const manager = await isOrganizerOf(viewer, id)
  if (!t || ((!t.visible || t.moderation !== 'approved') && !manager)) throw notFound('tournament_not_found')
  const link = manager ? await organizerLink(viewer, id) : null

  // the public never sees unreleased motions or draws
  const rounds = t.rounds.map(r => ({
    id: r.id, tournamentId: r.tournamentId, number: r.number, name: r.name,
    motion: r.status === 'draft' && !manager ? '' : r.motion,
    infoSlide: r.status === 'draft' && !manager ? undefined : r.infoSlide ?? undefined,
    status: r.status, date: toDay(r.date),
  }))
  const debates = t.rounds.filter(r => manager || r.status !== 'draft').flatMap(r => r.debates.map(toDebate))
  const chairIds = new Set(t.rounds.flatMap(r => r.debates.flatMap(d => d.judges.filter(j => j.isChair).map(j => j.judgeId))))

  return {
    ...toSummary(t),
    // organizer-only flags
    ...(manager && {
      visible: t.visible, plan: t.plan, paid: t.paid, moderation: t.moderation, moderationNote: t.moderationNote ?? undefined,
      myRole: link?.role ?? (viewer?.role === 'admin' ? 'admin' : undefined),
    }),
    schedule: t.schedule.map(s => ({ day: s.day, time: s.time, title: s.title })),
    rounds, debates,
    teams: t.teams.map(toTeam),
    judges: t.judges.map(j => ({
      id: j.id, tournamentId: j.tournamentId, name: j.name, institution: j.institution?.name ?? '', rating: j.rating, isChair: chairIds.has(j.id),
    })),
  }
}

// ---------- standings (computed from real ballots) ----------

export async function getStandings(tournamentId: string) {
  const [teams, debates] = await Promise.all([
    prisma.team.findMany({ where: { tournamentId }, include: teamInclude }),
    prisma.debate.findMany({
      where: { round: { tournamentId, status: 'completed' }, winner: { not: null } },
      include: { ballots: { include: { scores: true } } },
    }),
  ])

  const wins = new Map<string, number>(), losses = new Map<string, number>()
  const speakerSum = new Map<string, number>(), speakerRounds = new Map<string, number>()

  for (const d of debates) {
    const winnerId = d.winner === 'proposition' ? d.propositionTeamId : d.oppositionTeamId
    const loserId = d.winner === 'proposition' ? d.oppositionTeamId : d.propositionTeamId
    wins.set(winnerId, (wins.get(winnerId) ?? 0) + 1)
    losses.set(loserId, (losses.get(loserId) ?? 0) + 1)

    // a speaker's score in a debate = average over the panel's ballots (substantive speeches only)
    const perSpeaker = new Map<string, number[]>()
    for (const b of d.ballots) for (const s of b.scores) {
      if (s.position > 3) continue
      perSpeaker.set(s.speakerId, [...(perSpeaker.get(s.speakerId) ?? []), Number(s.score)])
    }
    for (const [speakerId, list] of perSpeaker) {
      speakerSum.set(speakerId, (speakerSum.get(speakerId) ?? 0) + list.reduce((a, c) => a + c, 0) / list.length)
      speakerRounds.set(speakerId, (speakerRounds.get(speakerId) ?? 0) + 1)
    }
  }

  const round1 = (n: number) => Math.round(n * 10) / 10
  const teamRows = teams.map(team => {
    const sp = team.speakers.reduce((s, x) => s + (speakerSum.get(x.id) ?? 0), 0)
    const w = wins.get(team.id) ?? 0, l = losses.get(team.id) ?? 0
    return { team: toTeam(team), wins: w, losses: l, speakerPoints: round1(sp), margins: 0 }
  }).sort((a, b) => b.wins - a.wins || b.speakerPoints - a.speakerPoints)

  const speakerRows = teams.flatMap(team => team.speakers.map(s => {
    const total = speakerSum.get(s.id) ?? 0, n = speakerRounds.get(s.id) ?? 0
    return { speaker: { id: s.id, name: s.name, teamId: team.id }, team: toTeam(team), total: round1(total), average: n ? round1(total / n) : 0 }
  })).sort((a, b) => b.total - a.total)

  return {
    teams: teamRows.map((r, i) => ({ rank: i + 1, ...r })),
    speakers: speakerRows.map((r, i) => ({ rank: i + 1, ...r })),
  }
}
