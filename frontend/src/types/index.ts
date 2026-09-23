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

export interface Judge {
  id: string
  tournamentId: string
  name: string
  institution: string
  rating: number // 1..10
  isChair?: boolean
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
}

export interface MyTournament extends Tournament {
  moderation: ModerationStatus
  moderationNote?: string
  myRole: OrganizerRole
}

export interface InvitePreview {
  kind: 'judge' | 'co_organizer'
  state: 'valid' | 'used' | 'expired'
  invitedBy: string
  expiresAt: string
  tournament: { id: string; name: string; city: string; startDate: string; endDate: string; cover: string }
}
