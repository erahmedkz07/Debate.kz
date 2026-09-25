// Domain types — mirror the planned DB schema (tournaments, teams, speakers, judges, rounds, debates, ballots)

export type TournamentLevel = 'school' | 'university'
export type TournamentStatus = 'registration' | 'ongoing' | 'finished'
export type TournamentFormat = 'WSDC'
export type Lang = 'ru' | 'kz'

export interface Tournament {
  id: string
  name: string
  city: string
  startDate: string // ISO date
  endDate: string
  format: TournamentFormat
  level: TournamentLevel
  status: TournamentStatus
  teamsCount: number
  maxTeams: number
  cover: string
  organizer: string
  description: string
  preliminaryRounds: number
  breakSize: number
  languages: Lang[]
}

export interface Speaker {
  id: string
  name: string
  teamId: string
}

export interface Team {
  id: string
  tournamentId: string
  name: string
  institution: string
  city: string
  speakers: Speaker[]
}

export type JudgeLevel = 'novice' | 'judge' | 'experienced' | 'chief'

export interface Judge {
  id: string
  tournamentId: string
  name: string
  institution: string
  rating: number // 1..10
  isChair?: boolean
  level?: JudgeLevel // earned level; only judges with an account have one
}

export interface JudgeProfile {
  level: JudgeLevel
  earnedLevel: JudgeLevel
  minLevel: JudgeLevel | null
  stats: {
    debates: number; tournaments: number; panels: number; agreement: number | null
    feedbackCount: number; feedbackAvg: number | null; organizerCount: number; organizerAvg: number | null
  }
  next: { level: JudgeLevel; checks: { key: string; current: number | null; required: number; met: boolean }[] } | null
}

export interface FeedbackItem {
  debateId: string
  tournament: { id: string; name: string }
  round: { number: number; name: string; date: string }
  opponent: { id: string; name: string }
  result: 'win' | 'loss'
  judges: { judgeId: string; name: string; isChair: boolean; given?: { score: number; comment?: string } }[]
}

export interface JudgeFeedbackRow {
  judgeId: string
  level?: JudgeLevel
  debates: number
  feedbackCount: number
  feedbackAvg: number | null
  review?: number
  items: { score: number; comment?: string; teamWon: boolean; team: string; round: string }[]
}

export interface Round {
  id: string
  tournamentId: string
  number: number
  name: string
  motion: string
  infoSlide?: string
  status: 'draft' | 'released' | 'completed'
  date: string
}

export interface Debate {
  id: string
  roundId: string
  room: string
  propositionTeamId: string
  oppositionTeamId: string
  judgeIds: string[]
  winner?: 'proposition' | 'opposition'
  ballotStatus: 'pending' | 'submitted' | 'confirmed'
}

export interface TeamStanding {
  rank: number
  team: Team
  wins: number
  losses: number
  speakerPoints: number
  margins: number
}

export interface SpeakerStanding {
  rank: number
  speaker: Speaker
  team: Team
  total: number
  average: number
}

export interface ScheduleItem {
  time: string
  title: string
  day: number
}

export interface TournamentDetails extends Tournament {
  // present for organizers only
  visible?: boolean
  plan?: 'free' | 'pro'
  paid?: boolean
  moderation?: ModerationStatus
  moderationNote?: string
  registrationOpen?: boolean
  reportHold?: boolean // hidden after reports until an admin decides
  autoApproved?: boolean // published without review thanks to organizer trust
  registrationDeadline?: string
  rooms?: string[]
  pendingRegistrations?: number
  myRole?: OrganizerRole | 'admin'
  schedule: ScheduleItem[]
  rounds: Round[]
  teams: Team[]
  judges: Judge[]
  debates: Debate[]
}

export interface RatingTeam {
  rank: number
  name: string
  institution: string
  city: string
  level: TournamentLevel
  tournaments: number
  wins: number
  points: number
}

export interface RatingSpeaker {
  rank: number
  name: string
  team: string
  city: string
  level: TournamentLevel
  tournaments: number
  average: number
}

export interface Testimonial {
  name: string
  role: string
  text: string
}

export interface TournamentFilters {
  search?: string
  city?: string
  level?: TournamentLevel | 'all'
  status?: TournamentStatus | 'all'
  sort?: 'date-asc' | 'date-desc' | 'teams'
}

// ---------- Auth & roles ----------
// global roles only; organizer / judge / speaker are rights inside a tournament
export type Role = 'user' | 'admin'
export type ModerationStatus = 'pending' | 'approved' | 'rejected'
export type OrganizerRole = 'owner' | 'co_organizer'

export interface User {
  id: string
  name: string
  email: string
  phone?: string
  role: Role
  institution?: string
  city?: string
  avatarUrl?: string
  createdAt: string
  blocked?: boolean
  emailVerified?: boolean
  organizes?: boolean // owns or co-organizes at least one tournament
  judgeLevel?: JudgeLevel // admin list only
  judgeLevelMin?: JudgeLevel // admin-set floor
  organizerTrust?: TrustLevel // admin list only
  organizerTrustOverride?: 'verified' | 'restricted'
  judges?: boolean // judges in at least one tournament
}

export interface TeamRegistration {
  id: string
  tournamentId: string
  teamName: string
  institution: string
  speakers: string[]
  status: 'pending' | 'confirmed' | 'rejected'
  createdAt: string
}

export interface JudgeAssignment {
  debate: Debate
  round: Round
  tournament: Pick<Tournament, 'id' | 'name' | 'city'>
  proposition: Team
  opposition: Team
  isChair: boolean
}

export interface AdminTournament extends Tournament {
  plan: 'free' | 'pro'
  paid: boolean
  visible: boolean
  moderation: ModerationStatus
  moderationNote?: string
  owner?: { name: string; email: string }
  autoApproved?: boolean
  reportHold?: boolean
  openReports?: number
}

export type TrustLevel = 'new' | 'trusted' | 'verified' | 'restricted'
export interface TrustProfile {
  level: TrustLevel
  earned: 'new' | 'trusted'
  override: 'verified' | 'restricted' | null
  autoPublish: boolean
  activeLimit: number
  active: number
  checks: { key: 'finished' | 'noUpheldReports' | 'noRecentRejections'; met: boolean; value: number }[]
}

export type ReportReason = 'fake' | 'inappropriate' | 'spam' | 'other'
export interface ReportQueueItem {
  tournament: Tournament & { reportHold: boolean; autoApproved: boolean; owner?: { name: string; email: string } }
  reports: { id: string; reason: ReportReason; text?: string; createdAt: string; reporter?: { name: string; email: string } }[]
}

export interface AdminAction {
  id: string
  adminName: string
  action: string
  targetType: 'tournament' | 'user'
  targetId: string
  targetLabel: string
  note?: string
  createdAt: string
}

export interface MyTournament extends Tournament {
  moderation: ModerationStatus
  moderationNote?: string
  reportHold?: boolean
  autoApproved?: boolean
  myRole: OrganizerRole
}

export interface InvitePreview {
  kind: 'judge' | 'co_organizer'
  state: 'valid' | 'used' | 'expired'
  invitedBy: string
  expiresAt: string
  tournament: { id: string; name: string; city: string; startDate: string; endDate: string; cover: string }
}
