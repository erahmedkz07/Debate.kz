// Data access layer. Components must use ONLY these functions.
// Every call goes to the Express API (/api, proxied by Vite in dev).
import type {
  Certificate, MotionItem, MotionTopic, SpeakerProgress, AdminPayment, KaspiInfo, PlatformSettings, TournamentPayment, EmailInvite, ClubDetails, ClubSummary, Ref, NewsItem, ClubJoinRequest, MySafetyReport, SafetyCategory, SafetyReport, SafetyStatus, TeammateKind, TeammatePost, AppNotification, AdminAction, AdminTournament, Debate, InvitePreview, Judge, JudgeAssignment, MyTournament, RatingClub, RatingSpeaker, RatingTeam, Role, Round, SpeakerStanding, Team, TeamRegistration, TeamStanding, Testimonial, Tournament, TournamentDetails, TournamentFilters, TournamentStatus, User, ScheduleItem, Side, PlayoffStage,
} from '@/types'
import { ApiError, http, qs, upload } from './http'
import i18n from '@/lib/i18n'

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
  http<Tournament[]>('GET', `/tournaments${qs({ search: f.search, region: f.region, level: f.level, status: f.status, sort: f.sort })}`)

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
export const getRating = () => http<{ teams: RatingTeam[]; speakers: RatingSpeaker[]; clubs: RatingClub[] }>('GET', '/rating')

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
  // the account starts in the language the site is shown in: letters and the bot use it
  authCall(http('POST', '/auth/register', { ...data, language: i18n.language === 'kz' ? 'kz' : 'ru' }))

export const verifyEmail = (token: string) => http<{ user: User }>('POST', '/auth/verify-email', { token }).then(r => r.user)
export const resendVerification = () => http<{ ok: true }>('POST', '/auth/resend-verification')

// password recovery: the server answers the same for any email (no account probing)
export const forgotPassword = (email: string) => http<{ ok: true }>('POST', '/auth/forgot-password', { email })
export const resetPassword = (token: string, password: string) =>
  http<{ user: User }>('POST', '/auth/reset-password', { token, password }).then(r => r.user)

export const logout = () => http<void>('POST', '/auth/logout')

export const getMe = () => http<{ user: User | null }>('GET', '/auth/me').then(r => r.user)

export const changePassword = (currentPassword: string, newPassword: string) =>
  http<{ user: User }>('POST', '/me/password', { currentPassword, newPassword }).then(r => r.user)
// accounts created with Google: a "set a password" link is emailed to the account address
export const requestPasswordSetup = () => http<{ ok: true }>('POST', '/me/password/setup')

// ---------- Sign in with Google ----------
// asked once per page load: whether the server has a Google client configured
let googleConfig: Promise<{ enabled: boolean }> | null = null
export const getGoogleConfig = () => (googleConfig ??= http<{ enabled: boolean }>('GET', '/auth/google/config').catch(() => ({ enabled: false })))
// a full-page navigation (not fetch): the server redirects to Google and back
// the site's language goes along, so a new account gets letters and the bot in it
export const googleSignInUrl = (mode: 'login' | 'link', next?: string | null, lang?: 'ru' | 'kz') =>
  `${import.meta.env.VITE_API_URL ?? '/api'}/auth/google/start${qs({ mode, next: next ?? undefined, lang })}`
export const unlinkGoogle = () => http<{ user: User }>('DELETE', '/auth/google').then(r => r.user)
// ---------- Telegram bot ----------
export const getTelegramConfig = () => http<{ enabled: boolean; username?: string }>('GET', '/telegram/config')
// the bot will speak the language the site is shown in right now
export const createTelegramLink = (language: 'ru' | 'kz') => http<{ url: string; expiresInMinutes: number }>('POST', '/me/telegram/link', { language })
export const setAccountLanguage = (language: 'ru' | 'kz') => http<{ user: User }>('PUT', '/me/language', { language }).then(r => r.user)
export const setTelegramNotify = (notify: boolean) => http<{ user: User }>('PATCH', '/me/telegram', { notify }).then(r => r.user)
export const unlinkTelegram = () => http<{ user: User }>('DELETE', '/me/telegram').then(r => r.user)
// confirmed by the password, or by typing the email for accounts without a password
export const deleteAccount = (confirm: { password: string } | { email: string }) => http<void>('DELETE', '/me', confirm)
export const updateProfile = (data: { name: string; phone?: string; institution?: string; city?: string; profileHidden?: boolean }) =>
  http<{ user: User }>('PATCH', '/me', data).then(r => r.user)

export function uploadAvatar(file: File) {
  const form = new FormData()
  form.append('avatar', file)
  return upload<{ user: User }>('/me/avatar', form).then(r => r.user)
}
export const deleteAvatar = () => http<{ user: User }>('DELETE', '/me/avatar').then(r => r.user)

// ---------- participant ----------

export const getMyRegistrations = () => http<(TeamRegistration & { tournament: Tournament })[]>('GET', '/me/registrations')

export const registerTeam = (tournamentId: string, data: { teamName: string; institution: string; speakers: string[]; phone: string; guardianConsent?: boolean }) =>
  http<TeamRegistration>('POST', `/tournaments/${encodeURIComponent(tournamentId)}/registrations`, data)

export interface MyDebate {
  debate: Pick<Debate, 'id' | 'roundId' | 'room' | 'ballotStatus' | 'winner' | 'onlineUrl'>
  // BP names the opening half explicitly: openingProposition / openingOpposition / closingProposition / closingOpposition
  side: 'proposition' | 'opposition' | 'openingProposition' | 'openingOpposition' | 'closingProposition' | 'closingOpposition'
  place?: number // BP: 1–4
  silent?: boolean // decided, but in a silent round: the result comes out with the break
  judges: { id: string; name: string; isChair: boolean; myScore?: number; myComment?: string }[] // the panel and my rating of each
  tournament: { id: string; name: string }
  round: Pick<Round, 'id' | 'number' | 'name' | 'motion' | 'status' | 'date'>
  opponent: { id: string; name: string }
  result: 'win' | 'loss' | null
}
export const getMyDebates = () => http<MyDebate[]>('GET', '/me/debates')
// a speaker rates a judge of their debate (1..5, optional comment); only the organizers read it
export const rateJudge = (debateId: string, judgeId: string, score: number, comment?: string) =>
  http<{ ok: true }>('POST', `/debates/${encodeURIComponent(debateId)}/feedback`, { judgeId, score, comment })
export interface JudgeFeedbackSummary {
  judgeId: string; count: number; average: number
  items: { score: number; comment?: string; team: string; round: string; room: string; createdAt: string }[]
}
// reviews of a finished tournament: public average, comments without names
export interface ReviewSummary { count: number; average: number | null; spread: number[] }
export interface TournamentReviews extends ReviewSummary {
  organizer: ReviewSummary
  items: { id: string; role: 'speaker' | 'judge'; score: number; comment: string; createdAt: string }[]
  canReview: boolean
  mine?: { score: number; comment?: string }
}
export const getTournamentReviews = (id: string) => http<TournamentReviews>('GET', `/tournaments/${encodeURIComponent(id)}/reviews`)
export const sendTournamentReview = (id: string, score: number, comment?: string) => http<{ ok: true }>('POST', `/tournaments/${encodeURIComponent(id)}/review`, { score, comment })
// best speaker / best judge: suggestions and the organizer's choice
export type AwardKind = 'best_speaker' | 'best_judge'
export interface AwardCandidates {
  speakers: { id: string; name: string; team: string; total: number; average: number; rounds: number }[]
  judges: { id: string; name: string; rating: number; reviews: number; average: number | null }[]
  otherJudges: { id: string; name: string; rating: number; reviews: number; average: number | null }[]
  minReviews: number; preliminaryRounds: number
  chosen: Partial<Record<AwardKind, { speakerId?: string; judgeId?: string; name: string }>>
}
export const getAwardCandidates = (id: string) => http<AwardCandidates>('GET', `/tournaments/${encodeURIComponent(id)}/awards`)
export const setTournamentAward = (id: string, kind: AwardKind, personId: string | null) => http<{ kind: AwardKind; name: string | null }>('PUT', `/tournaments/${encodeURIComponent(id)}/awards`, { kind, personId })
// a person's public page: career as a speaker and a judge, awards
export interface PublicProfile {
  id: string; name: string; avatarUrl?: string; city?: string; since: string; hidden: boolean; club?: { id: string; name: string }
  speaker: {
    tournaments: { id: string; name: string; startDate: string; status: string; team: string; place?: number; teams: number; inBreak: boolean; speakerRank?: number; average?: number }[]
    debates: number; wins: number; average: number | null; best: number | null
  }
  judge: {
    tournaments: { id: string; name: string; startDate: string; status: string; rounds: number; chaired: number }[]
    rounds: number; chaired: number; playoffRounds: number; rating?: { average: number | null; count: number }
  }
  awards: { tournament: { id: string; name: string }; date: string; kind: 'best_speaker' | 'best_judge' | 'category_champion' | 'team_place' | 'speaker_place'; place?: number; speakerPlace?: number; category?: string; code: string }[]
}
export const getPublicProfile = (id: string) => or404(http<PublicProfile>('GET', `/people/${encodeURIComponent(id)}`))
export const getJudgeFeedback = (tournamentId: string) => http<JudgeFeedbackSummary[]>('GET', `/tournaments/${encodeURIComponent(tournamentId)}/judge-feedback`)

// ---------- judge ----------

export const getJudgeAssignments = () => http<JudgeAssignment[]>('GET', '/judge/assignments')

// one judge's ballot as the organizer reads it (organizers only read ballots; judges send them)
export interface PanelBallot {
  judgeId: string
  name: string
  isChair: boolean
  hasAccount: boolean
  submittedAt?: string
  winner?: Side
  ranking?: Side[] // BP
  totals?: Partial<Record<Side, number>>
  scores?: { side: Side; position: number; speaker: string; score: number; feedback?: string }[]
}
// the ballot sheet's rules come from the tournament's format (and its score ranges)
export interface BallotRules { format: string; teams?: 2 | 4; speakers: number; step: number; speaker: [number, number]; reply?: { range: [number, number]; by: number[] } }
export interface BallotData {
  rules?: BallotRules
  canSubmit?: boolean // true for a judge who sends the ballot (BP: the chair); others get `panel` instead
  panel?: PanelBallot[]
  tournament: { id: string; name: string }
  round: Round
  debate: Debate
  proposition: Team
  opposition: Team
  closingProposition?: Team
  closingOpposition?: Team
  judges: Judge[]
}
export const getBallot = (debateId: string) => or404(http<BallotData>('GET', `/ballots/${encodeURIComponent(debateId)}`))

export interface BallotPayload {
  winner?: Side // two-team formats
  ranking?: Side[] // BP: the places 1st–4th (the server checks them against the totals)
  scores: Record<string, number> // speakerId -> substantive speech score
  // formats without reply speeches (Karl Popper) send neither
  reply?: Record<'proposition' | 'opposition', number>
  replySpeakers?: Record<'proposition' | 'opposition', string>
  feedback?: Record<string, string> // speakerId or "reply:<side>" -> short comment to the speaker
}
export const submitBallot = (debateId: string, payload: BallotPayload) =>
  http<{ ok: true }>('POST', `/ballots/${encodeURIComponent(debateId)}`, payload)

// ---------- organizer ----------

export const getMyTournaments = () => http<MyTournament[]>('GET', '/organizer/tournaments')

export interface CreateTournamentInput {
  name: string; city: string; region?: string; district?: string; startDate: string; endDate: string; level: 'school' | 'university' | 'mixed'; description: string
  preliminaryRounds: number; breakSize: number; maxTeams: number; registrationOpen: boolean; requireApproval: boolean
  registrationDeadline?: string; languages: ('ru' | 'kz')[]
  coverUrl?: string // a template picked in the wizard (an own picture is uploaded after creation)
  paymentReference?: string // Pro: the reference from getPlanQuote the organizer paid with
  format?: 'WSDC' | 'APF' | 'POPPER' | 'BP'
}
export const createTournament = (data: CreateTournamentInput) => http<Tournament>('POST', '/tournaments', data)
export const updateSchedule = (id: string, items: ScheduleItem[]) => http<ScheduleItem[]>('PUT', `/tournaments/${id}/schedule`, { items })
export const updateTournament = (id: string, data: Partial<{
  name: string; description: string; visible: boolean; registrationOpen: boolean; status: TournamentStatus
  city: string; region: string; district: string | null; startDate: string; endDate: string; registrationDeadline: string | null; maxTeams: number; rooms: string[]
  roomLinks: Record<string, string>
  breakCategories: { key: string; name: string; size: number }[]
  selectionMode: 'manual' | 'first_come' | 'lottery'
  clubQuota: number | null
  coverUrl: string | null
}>) =>
  http<Tournament>('PATCH', `/tournaments/${id}`, data)
export const deleteTournament = (id: string) => http<void>('DELETE', `/tournaments/${id}`)
export const adminDeleteTournament = (id: string, reason: string) => http<void>('DELETE', `/admin/tournaments/${id}`, { reason })

export interface TeamInput { name: string; institution: string; speakers: string[] }
export const addTeam = (tournamentId: string, data: TeamInput) => http<Team>('POST', `/tournaments/${tournamentId}/teams`, data)
export const updateTeam = (teamId: string, data: TeamInput) => http<Team>('PATCH', `/teams/${teamId}`, data)
export const deleteTeam = (teamId: string) => http<void>('DELETE', `/teams/${teamId}`)

export const deleteJudge = (judgeId: string) => http<void>('DELETE', `/judges/${judgeId}`)
export const setJudgeConflicts = (judgeId: string, teamIds: string[]) => http<{ judgeId: string; teamIds: string[] }>('PUT', `/judges/${judgeId}/conflicts`, { teamIds })

export const updateRound = (roundId: string, data: Partial<{ motion: string; infoSlide: string; status: 'released' | 'completed'; silent: boolean }>) =>
  http<Round>('PATCH', `/rounds/${roundId}`, data)
export type DrawMethod = 'power' | 'high_low' | 'random' | 'slide' | 'fold' | 'round_robin'
export interface DrawReport { method: DrawMethod | 'bracket'; protectClubs: boolean; sameClub: number; rematches: number; judgeConflicts?: number }
// ---------- playoffs ----------
export interface BracketDebate { id: string; slot: number; room: string; teams: { side: Side; teamId: string }[]; winner?: Side; ranking?: Side[] }
export interface BracketRound { id: string; number: number; name: string; stage: PlayoffStage; teamsInRound: number; status: Round['status']; motion: string; debates: BracketDebate[] }
// one bracket: the open break, or a category (novices…)
export interface BracketPart {
  seeds: { seed: number; team: Team }[]
  rounds: BracketRound[]
  champion?: Team // after its final
}
export interface Bracket extends BracketPart {
  format: string; breakSize: number; announced: boolean
  categories: (BracketPart & { key: string; name: string; size: number })[]
}
export const getBracket = (id: string) => http<Bracket>('GET', `/tournaments/${encodeURIComponent(id)}/bracket`)
export const announceBreak = (id: string) => http<Bracket>('POST', `/tournaments/${encodeURIComponent(id)}/break`)
export const cancelBreak = (id: string) => http<void>('DELETE', `/tournaments/${encodeURIComponent(id)}/break`)
export const setTeamCategories = (teamId: string, categories: string[]) => http<Team>('PUT', `/teams/${encodeURIComponent(teamId)}/categories`, { categories })

export const generateDraw = (roundId: string, opts: { presentOnly?: boolean; addSwing?: boolean; method?: DrawMethod; protectClubs?: boolean } = {}) =>
  http<{ debates: Debate[]; report: DrawReport }>('POST', `/rounds/${roundId}/draw`, opts)
export const updateDebate = (debateId: string, data: Partial<{ room: string; onlineUrl: string | null; swapSides: boolean; chairJudgeId: string; wingJudgeIds: string[] }>) =>
  http<Debate>('PATCH', `/debates/${debateId}`, data)

export type OrganizerRegistration = TeamRegistration & { contactPhone: string; user: { id: string; name: string; email: string } }
// selection: live numbers and, after a lottery, its public order
export interface Selection {
  mode: 'manual' | 'first_come' | 'lottery'; clubQuota?: number; places: number; taken: number; applications: number; waitlisted: number
  lotteryAt?: string; lottery?: { rank: number; team: string; status: TeamRegistration['status'] }[]
}
export const getSelection = (tournamentId: string) => http<Selection>('GET', `/tournaments/${encodeURIComponent(tournamentId)}/selection`)
export const runSelectionLottery = (tournamentId: string) => http<{ confirmed: number; waitlisted: number }>('POST', `/tournaments/${encodeURIComponent(tournamentId)}/selection/lottery`)
export const getRegistrations = (tournamentId: string) => http<OrganizerRegistration[]>('GET', `/tournaments/${tournamentId}/registrations`)
export const setRegistrationStatus = (regId: string, status: 'confirmed' | 'rejected' | 'waitlisted') =>
  http<{ id: string; status: string }>('PATCH', `/registrations/${regId}`, { status })

// ---------- invites (judge / co-organizer) ----------

export const createInvite = (tournamentId: string, kind: 'judge' | 'co_organizer') =>
  http<{ id: string; kind: string; url: string; expiresAt: string }>('POST', `/tournaments/${tournamentId}/invites`, { kind })
export const getInvite = (token: string) => or404(http<InvitePreview>('GET', `/invites/${encodeURIComponent(token)}`))
export const acceptInvite = (token: string) =>
  http<{ ok: true; kind: 'judge' | 'co_organizer'; tournamentId: string }>('POST', `/invites/${encodeURIComponent(token)}/accept`)
export const declineInvite = (token: string) => http<{ ok: true }>('POST', `/invites/${encodeURIComponent(token)}/decline`)
// invites by email: the person gets a notification and a letter; only that address can accept
// judgeId: link that judge (added earlier without an account) to the person instead of adding a new judge
export const inviteByEmail = (tournamentId: string, email: string, kind: 'judge' | 'co_organizer', judgeId?: string) =>
  http<EmailInvite & { registered: boolean; mailed: boolean }>('POST', `/tournaments/${tournamentId}/invites/email`, { email, kind, judgeId })
export const getEmailInvites = (tournamentId: string) => http<EmailInvite[]>('GET', `/tournaments/${tournamentId}/invites`)
export const revokeInvite = (tournamentId: string, inviteId: string) => http<void>('DELETE', `/tournaments/${tournamentId}/invites/${inviteId}`)

// ---------- admin ----------

export const getAdminStats = () =>
  http<{ users: number; organizers: number; judges: number; tournaments: number; active: number; unpaid: number; pendingModeration: number; pendingClubs: number; clubReports: number }>('GET', '/admin/stats')
export const getAdminTournaments = () => http<AdminTournament[]>('GET', '/admin/tournaments')
export const updateAdminTournament = (id: string, data: Partial<{ paid: boolean; visible: boolean; moderation: 'approved' | 'rejected'; moderationNote: string }>) =>
  http<AdminTournament>('PATCH', `/admin/tournaments/${id}`, data)
export const getUsers = () => http<User[]>('GET', '/admin/users')
// clubs for the admins: moderation, duplicates, reports
export interface AdminClub {
  id: string; name: string; city: string; institution?: string; logoUrl?: string
  status: 'pending' | 'approved' | 'rejected'; moderationNote?: string; createdAt: string; createdBy?: string
  members: number; teams: number; tournamentTeams: number
  reports: { id: string; reason: string; by: string; createdAt: string }[]
}
// organizer strikes: abandoned tournaments and last-minute cancellations
export interface StrikeItem { id: string; tournament: string; reason: 'abandoned' | 'late_cancel'; createdAt: string; lifted: boolean; note?: string }
export interface AdminStrike extends StrikeItem { user: { id: string; name: string; email: string } }
export const getMyStrikes = () => http<{ limit: number; active: number; items: StrikeItem[] }>('GET', '/me/strikes')
export const getAdminStrikes = () => http<AdminStrike[]>('GET', '/admin/strikes')
export const liftStrike = (id: string, note: string) => http<{ ok: true }>('POST', `/admin/strikes/${id}/lift`, { note })
export const getAdminClubs = () => http<AdminClub[]>('GET', '/admin/clubs')
export const reviewClub = (id: string, status: 'approved' | 'rejected', note?: string) => http<{ id: string; status: string }>('PATCH', `/admin/clubs/${id}`, { status, note })
export const mergeClub = (id: string, intoId: string) => http<{ id: string }>('POST', `/admin/clubs/${id}/merge`, { intoId })
export const adminDeleteClub = (id: string, reason: string) => http<void>('DELETE', `/admin/clubs/${id}`, { reason })
export const resolveClubReport = (id: string) => http<{ ok: true }>('POST', `/admin/club-reports/${id}/resolve`)
export const reportClub = (id: string, reason: string) => http<{ ok: true }>('POST', `/clubs/${encodeURIComponent(id)}/report`, { reason })
// ---------- certificates & check-in ----------
export const verifyCertificate = (code: string) => or404(http<Certificate>('GET', `/certificates/${encodeURIComponent(code)}`))
export const getMyCertificates = () => http<Certificate[]>('GET', '/me/certificates')
export const getTournamentCertificates = (id: string) => http<Certificate[]>('GET', `/tournaments/${id}/certificates`)
type CheckinStatus = { code?: string; present: number; total: number }
export const getCheckin = (id: string) => http<CheckinStatus>('GET', `/tournaments/${id}/checkin`)
export const newCheckinCode = (id: string) => http<CheckinStatus>('POST', `/tournaments/${id}/checkin/code`)
export const resetCheckin = (id: string) => http<CheckinStatus>('POST', `/tournaments/${id}/checkin/reset`)
export const setTeamCheckin = (teamId: string, present: boolean) => http<{ ok: true }>('PATCH', `/teams/${teamId}/checkin`, { present })
export const checkIn = (tournamentId: string, code: string) =>
  http<{ team: string; tournament: string; alreadyChecked: boolean }>('POST', `/checkin/${tournamentId}`, { code })

export const getProgress = () => http<SpeakerProgress>('GET', '/me/progress')

// ---------- motion bank ----------
export const getMotions = (f: { search?: string; level?: 'school' | 'university'; lang?: 'ru' | 'kz'; topic?: MotionTopic; page?: number }) =>
  http<{ items: MotionItem[]; total: number; page: number; pages: number; topicCounts: Record<MotionTopic, number> }>('GET', `/motions${qs(f)}`)

// ---------- find a teammate ----------
export const getTeammatePosts = (f: { kind?: string; city?: string; level?: string }) => http<TeammatePost[]>('GET', `/teammates${qs(f)}`)
export const createTeammatePost = (d: { kind: TeammateKind | string; city: string; level: string; languages: string[]; text: string }) =>
  http<{ id: string }>('POST', '/teammates', d)
export const closeTeammatePost = (id: string) => http<void>('DELETE', `/teammates/${id}`)
export const replyToTeammatePost = (id: string, message: string) => http<{ ok: true }>('POST', `/teammates/${id}/reply`, { message })

// ---------- safeguarding ----------
export const createSafetyReport = (d: { category: SafetyCategory; about?: string; place?: string; description: string; anonymous: boolean }) =>
  http<{ id: string }>('POST', '/safety-reports', d)
export const getMySafetyReports = () => http<MySafetyReport[]>('GET', '/me/safety-reports')
export const getSafetyReports = () => http<SafetyReport[]>('GET', '/safety-reports')
export const updateSafetyReport = (id: string, d: { status: SafetyStatus; resolutionNote?: string }) => http<{ ok: true }>('PATCH', `/safety-reports/${id}`, d)

// ---------- notifications ----------
export const getNotifications = (before?: string) =>
  http<{ items: AppNotification[]; unread: number; hasMore: boolean }>('GET', `/me/notifications${qs({ before })}`)
export const getUnreadCount = () => http<{ count: number }>('GET', '/me/notifications/unread').then(r => r.count)
export const markNotificationsRead = (ids?: string[]) => http<{ updated: number }>('POST', '/me/notifications/read', { ids })
export const getPlatformNotifications = (before?: string) =>
  http<{ items: AppNotification[]; hasMore: boolean; unread?: number }>('GET', `/admin/notifications${qs({ before })}`)

export const getAdminActions = () => http<AdminAction[]>('GET', '/admin/actions')
export const updateUser = (id: string, data: Partial<{ role: Role; blocked: boolean; safeguardingOfficer: boolean }>) => http<User>('PATCH', `/admin/users/${id}`, data)

// ---------- plans & Kaspi QR payments ----------
export const getPlans = () => http<{ freeTeamLimit: number; proPrice: number }>('GET', '/plans')
export const getTournamentPayment = (id: string) => http<TournamentPayment>('GET', `/tournaments/${id}/payment`)
// "I have paid": the payer note and the Kaspi receipt (a photo or a PDF)
export function claimPayment(id: string, payerNote: string, receipt: File) {
  const form = new FormData()
  form.append('payerNote', payerNote)
  form.append('receipt', receipt)
  return upload<{ ok: true }>(`/tournaments/${id}/payment/claim`, form)
}
// the creation wizard: amount, Kaspi details and a fresh payment reference before the tournament exists
export const getPlanQuote = () => http<{ amount: number; reference: string; freeTeamLimit: number; kaspi: KaspiInfo }>('GET', '/plans/quote')
// the receipt opens in a new tab (admins and the tournament's organizers only)
export const receiptUrl = (paymentId: string) => `${import.meta.env.VITE_API_URL ?? '/api'}/payments/${paymentId}/receipt`
export const getAdminPayments = () => http<AdminPayment[]>('GET', '/admin/payments')
export const handlePayment = (id: string, status: 'confirmed' | 'rejected', adminNote?: string) =>
  http<{ ok: true }>('PATCH', `/admin/payments/${id}`, { status, adminNote })
export const getPlatformSettings = () => http<PlatformSettings>('GET', '/admin/settings')
export const updatePlatformSettings = (d: { proPrice?: number; recipient?: string; phone?: string; note?: string }) =>
  http<PlatformSettings>('PATCH', '/admin/settings', d)
export function uploadKaspiQr(file: File) {
  const form = new FormData()
  form.append('qr', file)
  return upload<PlatformSettings>('/admin/settings/kaspi-qr', form)
}

// ---------- clubs ----------
export const getClubs = (f: { search?: string; city?: string } = {}) => http<ClubSummary[]>('GET', `/clubs${qs(f)}`)
export const getClub = (id: string) => or404(http<ClubDetails>('GET', `/clubs/${id}`))
export const getClubByCode = (code: string) => or404(http<ClubSummary>('GET', `/clubs/code/${encodeURIComponent(code)}`))
export const getMyClub = () => http<{ club?: Ref & { city: string }; team?: Ref }>('GET', '/me/club')
export const createClub = (d: { name: string; city: string; institution?: string; description?: string }) => http<{ id: string }>('POST', '/clubs', d)
export const updateClub = (id: string, d: { name?: string; city?: string; institution?: string; description?: string }) => http<{ ok: true }>('PATCH', `/clubs/${id}`, d)
export const resetClubCode = (id: string) => http<{ joinCode: string }>('POST', `/clubs/${id}/code`)
export const joinClub = (code: string) => http<{ id: string }>('POST', '/clubs/join', { code })
export const leaveClub = (id: string) => http<void>('POST', `/clubs/${id}/leave`)
export const removeClubMember = (id: string, userId: string) => http<void>('DELETE', `/clubs/${id}/members/${userId}`)
export const createClubTeam = (id: string, name: string, join = false) => http<Ref>('POST', `/clubs/${id}/teams`, { name, join })
export const renameClubTeam = (teamId: string, name: string) => http<{ ok: true }>('PATCH', `/club-teams/${teamId}`, { name })
export const deleteClubTeam = (teamId: string) => http<void>('DELETE', `/club-teams/${teamId}`)
export const setMemberTeam = (clubId: string, userId: string, teamId: string | null) => http<{ ok: true }>('PUT', `/clubs/${clubId}/members/${userId}/team`, { teamId })

// ---------- news ----------
export const getNews = (page = 1, drafts = false) =>
  http<{ items: NewsItem[]; total: number; page: number; pages: number }>('GET', `/news${qs({ page, drafts: drafts ? '1' : undefined })}`)
export const getNewsItem = (id: string) => or404(http<NewsItem>('GET', `/news/${id}`))
export type NewsInput = { title: string; summary: string; body: string; coverUrl?: string; published?: boolean }
export const createNews = (d: NewsInput) => http<{ id: string }>('POST', '/news', d)
export const updateNews = (id: string, d: Partial<NewsInput>) => http<{ ok: true }>('PATCH', `/news/${id}`, d)
export const deleteNews = (id: string) => http<void>('DELETE', `/news/${id}`)

// requests to join a club
export const requestToJoinClub = (clubId: string, message: string) => http<{ id: string }>('POST', `/clubs/${clubId}/requests`, { message })
export const getClubRequests = (clubId: string) => http<ClubJoinRequest[]>('GET', `/clubs/${clubId}/requests`)
export const answerClubRequest = (id: string, status: 'accepted' | 'declined', teamId?: string | null) => http<{ ok: true }>('PATCH', `/club-requests/${id}`, { status, teamId })
export const cancelClubRequest = (id: string) => http<void>('DELETE', `/club-requests/${id}`)
export const getMyClubRequests = () => http<{ id: string; club: Ref & { city: string }; createdAt: string }[]>('GET', '/me/club-requests')

// ---------- tournament cover ----------
export const getCoverTemplates = () => http<string[]>('GET', '/tournament-covers')
export function uploadTournamentCover(id: string, file: File) {
  const form = new FormData()
  form.append('cover', file)
  return upload<{ cover: string }>(`/tournaments/${id}/cover`, form)
}

// club and club-team logos (any member); the server stores a square WebP
const logoForm = (file: File) => { const f = new FormData(); f.append('logo', file); return f }
export const uploadClubLogo = (clubId: string, file: File) => upload<{ logoUrl: string }>(`/clubs/${clubId}/logo`, logoForm(file))
export const deleteClubLogo = (clubId: string) => http<void>('DELETE', `/clubs/${clubId}/logo`)
export const uploadClubTeamLogo = (teamId: string, file: File) => upload<{ logoUrl: string }>(`/club-teams/${teamId}/logo`, logoForm(file))
export const deleteClubTeamLogo = (teamId: string) => http<void>('DELETE', `/club-teams/${teamId}/logo`)
