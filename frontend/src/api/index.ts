// Data access layer. Components must use ONLY these functions.
// Today they return mock data with a fake delay; later each body becomes a fetch() to the Express API.
import type {
  RatingSpeaker, RatingTeam, SpeakerStanding, TeamStanding, Testimonial, Tournament, TournamentDetails, TournamentFilters,
} from '@/types'
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

export async function login(email: string, _password: string) {
  await delay(700)
  return { id: 'u1', name: 'Аргын', email, role: 'organizer' as const }
}

export async function register(data: { name: string; email: string; role: string }) {
  await delay(800)
  return { id: 'u2', ...data }
}
