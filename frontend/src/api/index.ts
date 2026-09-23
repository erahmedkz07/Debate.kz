// Data access layer. Components must use ONLY these functions.
// Today they return mock data with a fake delay; later each body becomes a fetch() to the Express API.
import type {
  AdminTournament, JudgeAssignment, RatingSpeaker, RatingTeam, Role, SpeakerStanding, TeamRegistration, TeamStanding, Testimonial,
  Tournament, TournamentDetails, TournamentFilters, User,
} from '@/types'
import { DEMO_PASSWORD, initialRegistrations, judgeLinks, participantTeams, users } from '@/mocks/users'
import { cities, ratingSpeakers, ratingTeams, schedule, stats, testimonials, tournamentData, tournaments } from '@/mocks/data'

const delay = (ms = 450) => new Promise(r => setTimeout(r, ms + Math.random() * 250))
const clone = <T,>(v: T): T => structuredClone(v)

export class NotFoundError extends Error {}

export async function getTournaments(filters: TournamentFilters = {}): Promise<Tournament[]> {
  await delay()
  const q = filters.search?.trim().toLowerCase()
  let list = tournaments.filter(t =>
    (!q || t.name.toLowerCase().includes(q) || t.organizer.toLowerCase().includes(q)) &&
    (!filters.city || filters.city === 'all' || t.city === filters.city) &&
    (!filters.level || filters.level === 'all' || t.level === filters.level) &&
    (!filters.status || filters.status === 'all' || t.status === filters.status))
  const sort = filters.sort ?? 'date-asc'
  // "nearest first": live and upcoming tournaments by date, finished ones at the end
  const statusRank = { ongoing: 0, registration: 1, finished: 2 }
  list = [...list].sort((a, b) =>
    sort === 'teams' ? b.teamsCount - a.teamsCount
      : sort === 'date-desc' ? b.startDate.localeCompare(a.startDate)
        : statusRank[a.status] - statusRank[b.status] || a.startDate.localeCompare(b.startDate))
  return clone(list)
}

export async function getUpcomingTournaments(limit = 3): Promise<Tournament[]> {
  const list = await getTournaments({ status: 'registration', sort: 'date-asc' })
  return list.slice(0, limit)
}

export async function getTournamentById(id: string): Promise<TournamentDetails> {
  await delay()
  const t = tournaments.find(x => x.id === id)
  if (!t) throw new NotFoundError(`Tournament ${id} not found`)
  return clone({ ...t, schedule, ...tournamentData[id] })
}

export async function getMyTournaments(): Promise<Tournament[]> {
  await delay()
  return clone(tournaments.filter(t => ['t1', 't4', 't7'].includes(t.id)))
}

export async function getCities(): Promise<string[]> {
  return cities
}

export async function getPlatformStats() {
  await delay(200)
  return { ...stats }
}

export async function getTestimonials(): Promise<Testimonial[]> {
  await delay(200)
  return clone(testimonials)
}

// deterministic pseudo score so the same speaker always gets the same points
const score = (seed: string, round: number) => {
  let h = 0
  for (const c of seed + round) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return 68 + (h % 110) / 10 // 68.0 .. 78.9
}

export async function getStandings(id: string): Promise<{ teams: TeamStanding[]; speakers: SpeakerStanding[] }> {
  const t = await getTournamentById(id)
  const done = new Set(t.rounds.filter(r => r.status === 'completed').map(r => r.id))
  const rows = t.teams.map(team => {
    let wins = 0, losses = 0, sp = 0
    t.debates.filter(d => done.has(d.roundId)).forEach(d => {
      const side = d.propositionTeamId === team.id ? 'proposition' : d.oppositionTeamId === team.id ? 'opposition' : null
      if (!side) return
      if (d.winner === side) wins++; else losses++
      const rn = Number(d.roundId.split('-r')[1])
      sp += team.speakers.reduce((s, spk) => s + score(spk.id, rn), 0)
    })
    return { team, wins, losses, speakerPoints: Math.round(sp * 10) / 10, margins: Math.round((wins - losses) * 3.5 * 10) / 10 }
  })
  rows.sort((a, b) => b.wins - a.wins || b.speakerPoints - a.speakerPoints)
  const rounds = t.rounds.filter(r => r.status === 'completed').map(r => r.number)
  const speakers = t.teams.flatMap(team => team.speakers.map(speaker => {
    const total = rounds.reduce((s, n) => s + score(speaker.id, n), 0)
    return { speaker, team, total: Math.round(total * 10) / 10, average: rounds.length ? Math.round((total / rounds.length) * 10) / 10 : 0 }
  })).sort((a, b) => b.total - a.total)
  return {
    teams: rows.map((r, i) => ({ rank: i + 1, ...r })),
    speakers: speakers.map((s, i) => ({ rank: i + 1, ...s })),
  }
}

export async function getRating(): Promise<{ teams: RatingTeam[]; speakers: RatingSpeaker[] }> {
  await delay()
  return clone({ teams: ratingTeams, speakers: ratingSpeakers })
}

export async function getBallot(debateId: string) {
  const tournamentId = debateId.split('-')[0]
  const t = await getTournamentById(tournamentId)
  const debate = t.debates.find(d => d.id === debateId)
  if (!debate) throw new NotFoundError(`Debate ${debateId} not found`)
  const round = t.rounds.find(r => r.id === debate.roundId)!
  return {
    tournament: { id: t.id, name: t.name },
    round, debate,
    proposition: t.teams.find(x => x.id === debate.propositionTeamId)!,
    opposition: t.teams.find(x => x.id === debate.oppositionTeamId)!,
    judges: t.judges.filter(j => debate.judgeIds.includes(j.id)),
  }
}

export interface BallotPayload {
  debateId: string
  winner: 'proposition' | 'opposition'
  replySpeakers: Record<'proposition' | 'opposition', string>
  scores: Record<string, number>
}

export async function submitBallot(payload: BallotPayload): Promise<{ ok: true }> {
  await delay(700)
  console.info('[mock] ballot submitted', payload)
  return { ok: true }
}

// ---------- Auth (mock) ----------
// Registered demo users live in localStorage until the real backend (JWT) exists.
export class AuthError extends Error {
  constructor(public code: 'invalid' | 'exists' | 'blocked') { super(code) }
}

type StoredUser = User & { password: string }

const read = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? '') as T } catch { return fallback }
}
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode */ }
}

const allUsers = (): StoredUser[] => [
  ...users.map(u => ({ ...u, password: DEMO_PASSWORD })),
  ...read<StoredUser[]>('mock-users', []),
]
const strip = ({ password: _p, ...u }: StoredUser): User => u

export async function login(email: string, password: string): Promise<User> {
  await delay(600)
  const u = allUsers().find(x => x.email.toLowerCase() === email.trim().toLowerCase())
  if (!u || u.password !== password) throw new AuthError('invalid')
  if (u.blocked) throw new AuthError('blocked')
  return strip(u)
}

export async function register(data: { name: string; email: string; phone: string; password: string; role: Exclude<Role, 'admin'> }): Promise<User> {
  await delay(700)
  if (allUsers().some(x => x.email.toLowerCase() === data.email.trim().toLowerCase())) throw new AuthError('exists')
  const user: StoredUser = { id: `u-${Date.now()}`, createdAt: new Date().toISOString().slice(0, 10), ...data, email: data.email.trim() }
  write('mock-users', [...read<StoredUser[]>('mock-users', []), user])
  return strip(user)
}

// ---------- Participant ----------
export async function getMyRegistrations(userId: string): Promise<(TeamRegistration & { tournament: Tournament })[]> {
  await delay(400)
  const list = [...(initialRegistrations[userId] ?? []), ...read<TeamRegistration[]>(`mock-regs-${userId}`, [])]
  return clone(list.map(r => ({ ...r, tournament: tournaments.find(t => t.id === r.tournamentId)! })).filter(r => r.tournament))
}

export async function registerTeam(userId: string, data: Omit<TeamRegistration, 'id' | 'status' | 'createdAt'>): Promise<TeamRegistration> {
  await delay(700)
  const reg: TeamRegistration = { ...data, id: `reg-${Date.now()}`, status: 'pending', createdAt: new Date().toISOString().slice(0, 10) }
  write(`mock-regs-${userId}`, [...read<TeamRegistration[]>(`mock-regs-${userId}`, []), reg])
  return reg
}

export async function getMyDebates(userId: string) {
  await delay(400)
  return clone((participantTeams[userId] ?? []).flatMap(teamId => {
    const tId = teamId.split('-')[0]
    const t = tournaments.find(x => x.id === tId)!
    const d = tournamentData[tId]
    return d.debates.filter(x => x.propositionTeamId === teamId || x.oppositionTeamId === teamId).map(debate => {
      const side = debate.propositionTeamId === teamId ? 'proposition' as const : 'opposition' as const
      const opponentId = side === 'proposition' ? debate.oppositionTeamId : debate.propositionTeamId
      return {
        debate, side, tournament: { id: t.id, name: t.name },
        round: d.rounds.find(r => r.id === debate.roundId)!,
        opponent: d.teams.find(x => x.id === opponentId)!,
        result: debate.winner ? (debate.winner === side ? 'win' as const : 'loss' as const) : null,
      }
    })
  }))
}

// ---------- Judge ----------
export async function getJudgeAssignments(userId: string): Promise<JudgeAssignment[]> {
  await delay(450)
  const ids = judgeLinks[userId] ?? []
  const result: JudgeAssignment[] = []
  for (const judgeId of ids) {
    const tId = judgeId.split('-')[0]
    const t = tournaments.find(x => x.id === tId)!
    const d = tournamentData[tId]
    d.debates.filter(x => x.judgeIds.includes(judgeId)).forEach(debate => {
      result.push({
        debate, round: d.rounds.find(r => r.id === debate.roundId)!,
        tournament: { id: t.id, name: t.name, city: t.city },
        proposition: d.teams.find(x => x.id === debate.propositionTeamId)!,
        opposition: d.teams.find(x => x.id === debate.oppositionTeamId)!,
        isChair: debate.judgeIds[0] === judgeId,
      })
    })
  }
  return clone(result)
}

// ---------- Admin ----------
export async function getAdminTournaments(): Promise<AdminTournament[]> {
  await delay(450)
  return clone(tournaments.map(t => ({ ...t, plan: t.maxTeams > 12 ? 'pro' : 'free', paid: t.maxTeams <= 12 || t.status !== 'registration', visible: true })))
}

export async function getUsers(): Promise<User[]> {
  await delay(450)
  return clone(allUsers().map(strip))
}

export async function getAdminStats() {
  await delay(300)
  const list = allUsers()
  return {
    users: list.length,
    organizers: list.filter(u => u.role === 'organizer').length,
    judges: list.filter(u => u.role === 'judge').length,
    tournaments: tournaments.length,
    active: tournaments.filter(t => t.status !== 'finished').length,
    unpaid: tournaments.filter(t => t.maxTeams > 12 && t.status === 'registration').length,
  }
}
