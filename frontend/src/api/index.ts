// Data access layer. Components must use ONLY these functions.
// Every call goes to the Express API (/api, proxied by Vite in dev).
import type {
  AdminTournament, Debate, InvitePreview, Judge, JudgeAssignment, MyTournament, RatingSpeaker, RatingTeam, Role, Round, SpeakerStanding,
  Team, TeamRegistration, TeamStanding, Testimonial, Tournament, TournamentDetails, TournamentFilters, User,
} from '@/types'
import { ApiError, http, qs, upload } from './http'

export { ApiError }

export class NotFoundError extends Error {}

// map 404 to NotFoundError so pages can show the 404 screen
const or404 = async <T,>(p: Promise<T>) => {
  try {
    return await p
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) throw new NotFoundError(e.code)
    throw e
  }
}

// ---------- public ----------

export const getTournaments = (f: TournamentFilters = {}) =>
  http<Tournament[]>('GET', `/tournaments${qs({ search: f.search, city: f.city, level: f.level, status: f.status, sort: f.sort })}`)

export const getUpcomingTournaments = (limit = 3) =>
  http<Tournament[]>('GET', `/tournaments${qs({ status: 'registration', sort: 'date-asc', limit })}`)

export const getTournamentById = (id: string) => or404(http<TournamentDetails>('GET', `/tournaments/${encodeURIComponent(id)}`))

export const getStandings = (id: string) =>
  or404(http<{ teams: TeamStanding[]; speakers: SpeakerStanding[] }>('GET', `/tournaments/${encodeURIComponent(id)}/standings`))

export const getCities = () => http<string[]>('GET', '/cities')
export const getPlatformStats = () => http<{ tournaments: number; teams: number; debaters: number; cities: number }>('GET', '/stats')
export interface LiveRound {
  personal: boolean // true = a tournament where the signed-in user speaks, judges or organizes
  tournament: { id: string; name: string }
  round: { number: number; motion: string }
  ballots: { submitted: number; total: number }
}
export const getLive = () => http<LiveRound | null>('GET', '/live')
export const getTestimonials = () => http<Testimonial[]>('GET', '/testimonials')
export const getRating = () => http<{ teams: RatingTeam[]; speakers: RatingSpeaker[] }>('GET', '/rating')

// ---------- auth ----------

// codes the UI translates: invalid | exists | blocked
export class AuthError extends Error {
  constructor(public code: 'invalid' | 'exists' | 'blocked') { super(code) }
}

const authCall = async (p: Promise<{ user: User }>) => {
  try {
    return (await p).user
  } catch (e) {
    if (e instanceof ApiError && ['invalid', 'exists', 'blocked'].includes(e.code)) throw new AuthError(e.code as AuthError['code'])
    throw e
  }
}

export const login = (email: string, password: string) => authCall(http('POST', '/auth/login', { email, password }))

// no role: everyone starts as a plain user; consent to personal data processing is required
export const register = (data: { name: string; email: string; phone: string; password: string; consent: true }) =>
  authCall(http('POST', '/auth/register', data))

export const verifyEmail = (token: string) => http<{ user: User }>('POST', '/auth/verify-email', { token }).then(r => r.user)
export const resendVerification = () => http<{ ok: true }>('POST', '/auth/resend-verification')

// password recovery: the server answers the same for any email (no account probing)
export const forgotPassword = (email: string) => http<{ ok: true }>('POST', '/auth/forgot-password', { email })
export const resetPassword = (token: string, password: string) =>
  http<{ user: User }>('POST', '/auth/reset-password', { token, password }).then(r => r.user)

export const logout = () => http<void>('POST', '/auth/logout')

export const getMe = () => http<{ user: User | null }>('GET', '/auth/me').then(r => r.user)

export const updateProfile = (data: { name: string; phone?: string; institution?: string; city?: string }) =>
  http<{ user: User }>('PATCH', '/me', data).then(r => r.user)

export function uploadAvatar(file: File) {
  const form = new FormData()
  form.append('avatar', file)
  return upload<{ user: User }>('/me/avatar', form).then(r => r.user)
}
export const deleteAvatar = () => http<{ user: User }>('DELETE', '/me/avatar').then(r => r.user)

// ---------- participant ----------

export const getMyRegistrations = () => http<(TeamRegistration & { tournament: Tournament })[]>('GET', '/me/registrations')

export const registerTeam = (tournamentId: string, data: { teamName: string; institution: string; speakers: string[]; phone: string }) =>
  http<TeamRegistration>('POST', `/tournaments/${encodeURIComponent(tournamentId)}/registrations`, data)

export interface MyDebate {
  debate: Pick<Debate, 'id' | 'roundId' | 'room' | 'ballotStatus' | 'winner'>
  side: 'proposition' | 'opposition'
  tournament: { id: string; name: string }
  round: Pick<Round, 'id' | 'number' | 'name' | 'motion' | 'status' | 'date'>
  opponent: { id: string; name: string }
  result: 'win' | 'loss' | null
}
export const getMyDebates = () => http<MyDebate[]>('GET', '/me/debates')

// ---------- judge ----------

export const getJudgeAssignments = () => http<JudgeAssignment[]>('GET', '/judge/assignments')

export interface BallotData {
  tournament: { id: string; name: string }
  round: Round
  debate: Debate
  proposition: Team
  opposition: Team
  judges: Judge[]
}
export const getBallot = (debateId: string) => or404(http<BallotData>('GET', `/ballots/${encodeURIComponent(debateId)}`))

export interface BallotPayload {
  winner: 'proposition' | 'opposition'
  scores: Record<string, number> // speakerId -> substantive speech score
  reply: Record<'proposition' | 'opposition', number>
  replySpeakers: Record<'proposition' | 'opposition', string>
}
export const submitBallot = (debateId: string, payload: BallotPayload) =>
  http<{ ok: true }>('POST', `/ballots/${encodeURIComponent(debateId)}`, payload)

// ---------- organizer ----------

export const getMyTournaments = () => http<MyTournament[]>('GET', '/organizer/tournaments')

export interface CreateTournamentInput {
  name: string; city: string; startDate: string; endDate: string; level: 'school' | 'university'; description: string
  preliminaryRounds: number; breakSize: number; maxTeams: number; registrationOpen: boolean; requireApproval: boolean
  registrationDeadline?: string; languages: ('ru' | 'kz')[]
}
export const createTournament = (data: CreateTournamentInput) => http<Tournament>('POST', '/tournaments', data)
export const updateTournament = (id: string, data: Partial<{ name: string; description: string; visible: boolean; registrationOpen: boolean }>) =>
  http<Tournament>('PATCH', `/tournaments/${id}`, data)
export const deleteTournament = (id: string) => http<void>('DELETE', `/tournaments/${id}`)

export interface TeamInput { name: string; institution: string; speakers: string[] }
export const addTeam = (tournamentId: string, data: TeamInput) => http<Team>('POST', `/tournaments/${tournamentId}/teams`, data)
export const updateTeam = (teamId: string, data: TeamInput) => http<Team>('PATCH', `/teams/${teamId}`, data)
export const deleteTeam = (teamId: string) => http<void>('DELETE', `/teams/${teamId}`)

export const addJudge = (tournamentId: string, data: { name: string; institution?: string; rating: number }) =>
  http<Judge>('POST', `/tournaments/${tournamentId}/judges`, data)

export const updateRound = (roundId: string, data: Partial<{ motion: string; infoSlide: string; status: 'released' | 'completed' }>) =>
  http<Round>('PATCH', `/rounds/${roundId}`, data)
export const generateDraw = (roundId: string) => http<Debate[]>('POST', `/rounds/${roundId}/draw`)
export const updateDebate = (debateId: string, data: Partial<{ room: string; swapSides: boolean; chairJudgeId: string }>) =>
  http<Debate>('PATCH', `/debates/${debateId}`, data)

export type OrganizerRegistration = TeamRegistration & { contactPhone: string; user: { id: string; name: string; email: string } }
export const getRegistrations = (tournamentId: string) => http<OrganizerRegistration[]>('GET', `/tournaments/${tournamentId}/registrations`)
export const setRegistrationStatus = (regId: string, status: 'confirmed' | 'rejected') =>
  http<{ id: string; status: string }>('PATCH', `/registrations/${regId}`, { status })

// ---------- invites (judge / co-organizer) ----------

export const createInvite = (tournamentId: string, kind: 'judge' | 'co_organizer') =>
  http<{ id: string; kind: string; url: string; expiresAt: string }>('POST', `/tournaments/${tournamentId}/invites`, { kind })
export const getInvite = (token: string) => or404(http<InvitePreview>('GET', `/invites/${encodeURIComponent(token)}`))
export const acceptInvite = (token: string) =>
  http<{ ok: true; kind: 'judge' | 'co_organizer'; tournamentId: string }>('POST', `/invites/${encodeURIComponent(token)}/accept`)

// ---------- admin ----------

export const getAdminStats = () =>
  http<{ users: number; organizers: number; judges: number; tournaments: number; active: number; unpaid: number; pendingModeration: number }>('GET', '/admin/stats')
export const getAdminTournaments = () => http<AdminTournament[]>('GET', '/admin/tournaments')
export const updateAdminTournament = (id: string, data: Partial<{ paid: boolean; visible: boolean; moderation: 'approved' | 'rejected'; moderationNote: string }>) =>
  http<AdminTournament>('PATCH', `/admin/tournaments/${id}`, data)
export const getUsers = () => http<User[]>('GET', '/admin/users')
export const updateUser = (id: string, data: Partial<{ role: Role; blocked: boolean }>) => http<User>('PATCH', `/admin/users/${id}`, data)
