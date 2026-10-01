// Domain types — mirror the planned DB schema (tournaments, teams, speakers, judges, rounds, debates, ballots)

export type TournamentLevel = 'school' | 'university' | 'mixed' // mixed: school and university teams together
export type TournamentStatus = 'registration' | 'ongoing' | 'finished'
export type TournamentFormat = 'WSDC' | 'APF' | 'POPPER' | 'BP'
// WSDC, APF, Karl Popper: proposition / opposition; British Parliamentary adds the closing half
export type Side = 'proposition' | 'opposition' | 'closingProposition' | 'closingOpposition'
export type Lang = 'ru' | 'kz'

export interface Tournament {
  id: string
  name: string
  city: string
  startDate: string // ISO date
  endDate: string
  format: TournamentFormat
  region?: string // region code (content/geo.ts)
  district?: string // a district of a big city or an address
  level: TournamentLevel
  status: TournamentStatus
  teamsCount: number
  applications?: number // live applications (all but rejected): demand for the places
  maxTeams: number
  cover: string
  organizer: string
  description: string
  preliminaryRounds: number
  breakSize: number
  breakCategories?: BreakCategory[] // extra brackets (novices, juniors…)
  languages: Lang[]
}

export interface Speaker {
  id: string
  name: string
  teamId: string
  userId?: string // links to the person's public page (an account that did not hide it)
}

export interface Team {
  id: string
  tournamentId: string
  name: string
  institution: string
  city: string
  speakers: Speaker[]
  checkedIn?: boolean // present at the venue (QR check-in)
  swing?: boolean // stand-in team for an odd draw, never ranked
  club?: Ref & { logoUrl?: string } // the club and club team it comes from
  clubTeam?: Ref
  logoUrl?: string // the club team's logo, else the club's
  breakSeed?: number // 1..breakSize once the break is announced
  breakCategory?: string // the category bracket it broke into (none = the open break)
  categories?: string[] // break categories the team may break in
  institutionId?: string // organizers only (judge conflicts)
}

export interface Judge {
  id: string
  tournamentId: string
  name: string
  institution: string
  rating: number // 1..10
  isChair?: boolean
  hasAccount?: boolean // only judges with an account send ballots; others are invited by email to link one
  userId?: string // links to the judge's public page
  // organizers only: what the draw keeps this judge away from
  conflictTeamIds?: string[] // personal conflicts (relative, former coach…)
  clubId?: string // the judge's own club
  institutionId?: string
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
  silent?: boolean // a closed round: results hidden from the public until the break
  // playoffs: elimination rounds after the break (quarterfinal, semifinal, final)
  kind?: 'elimination'
  teamsInRound?: number
  stage?: PlayoffStage
  category?: string // a category bracket (novices…): its key and name
  categoryName?: string
}

export type PlayoffStage = 'final' | 'semi' | 'quarter' | 'octo'
export interface BreakCategory { key: string; name: string; size: number }

export interface Debate {
  id: string
  roundId: string
  room: string
  propositionTeamId: string
  oppositionTeamId: string
  // British Parliamentary: the closing half and the places 1st–4th once decided
  closingPropositionTeamId?: string
  closingOppositionTeamId?: string
  ranking?: Side[]
  bracketSlot?: number // playoffs: the debate's place in the bracket
  onlineUrl?: string // online tournaments: the room's video call (its teams, judges and organizers only)
  judgeIds: string[]
  winner?: Side
  ballotStatus: 'pending' | 'submitted' | 'confirmed'
}

export interface TeamStanding {
  rank: number
  team: Team
  wins: number
  losses: number
  points: number // wins in two-team formats, team points (3/2/1/0 per round) in BP
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
  registrationDeadline?: string
  rooms?: string[]
  roomLinks?: Record<string, string> // room name -> video call link
  awards?: { kind: 'best_speaker' | 'best_judge'; name: string }[] // best speaker / best judge (public after the finish)
  selectionMode?: 'manual' | 'first_come' | 'lottery' // how the places are filled
  clubQuota?: number // at most this many teams per club
  lotteryAt?: string // when the selection lottery was drawn
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
  club?: Ref
  logoUrl?: string
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
  club?: Ref
  city: string
  level: TournamentLevel
  tournaments: number
  average: number
}

export interface RatingClub {
  rank: number
  id: string
  name: string
  logoUrl?: string
  city: string
  level: TournamentLevel | 'mixed' // plays both school and university events
  tournaments: number
  teams: number
  wins: number
  debates: number
  winRate: number // %
  points: number
  speakerAverage: number
}

export interface Testimonial {
  name: string
  role: string
  text: string
}

export interface TournamentFilters {
  search?: string
  region?: string // region code, see content/geo.ts
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
  phoneVerified?: boolean // confirmed through the Telegram bot
  googleLinked?: boolean // Sign in with Google is connected
  googleEmail?: string // the linked Google address (may differ from email)
  hasPassword?: boolean // false for accounts created with Google until a password is set
  telegramLinked?: boolean
  telegramUsername?: string
  telegramNotify?: boolean
  language?: 'ru' | 'kz' // the Telegram bot and notifications speak it
  organizes?: boolean // owns or co-organizes at least one tournament
  judges?: boolean // judges in at least one tournament
  club?: Ref // required in the profile before applying to tournaments
  clubTeam?: Ref
  safeguardingOfficer?: boolean // handles behaviour reports
  profileHidden?: boolean // "hide my public profile"
}

export interface TeamRegistration {
  id: string
  tournamentId: string
  teamName: string
  institution: string
  speakers: string[]
  status: 'pending' | 'confirmed' | 'rejected' | 'waitlisted'
  createdAt: string
  lotteryRank?: number // the place in the selection lottery
  club?: string
}

export interface JudgeAssignment {
  debate: Debate
  round: Round
  tournament: Pick<Tournament, 'id' | 'name' | 'city'> & { format?: TournamentFormat }
  proposition: Team
  opposition: Team
  closingProposition?: Team
  closingOpposition?: Team
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

// ---------- certificates ----------
export interface Certificate {
  code: string
  kind: 'speaker' | 'judge' | 'award'
  award?: 'best_speaker' | 'best_judge' // an award diploma
  name: string
  teamName?: string
  institution?: string
  teamPlace?: number
  inBreak: boolean
  speakerPlace?: number
  breakCategory?: string // the category bracket the team played in, and its place there
  categoryPlace?: number
  issuedAt: string
  tournament: { id: string; name: string; city: string; level: TournamentLevel; organizer: string; startDate: string; endDate: string }
}

// ---------- speaker progress ----------
export interface SpeakerProgress {
  summary: { speeches: number; debates: number; wins: number; average: number | null; best: number | null; replyAverage: number | null; trend: number | null }
  timeline: { date: string; tournament: string; round: string; position: number; score: number; won: boolean }[]
  byPosition: { position: number; average: number | null; count: number }[]
  byTopic: { topic: MotionTopic; average: number; count: number }[]
  comments: { judge: string; text: string; position: number; score: number; tournament: string; round: string; date: string }[]
}

// ---------- motion bank ----------
export type MotionTopic = 'education' | 'technology' | 'economy' | 'politics' | 'international' | 'environment' | 'society' | 'rights' | 'media' | 'health' | 'culture' | 'sport'
export interface MotionItem {
  id: string
  motion: string
  infoSlide?: string
  round: string
  date: string
  topics: MotionTopic[]
  language: 'ru' | 'kz'
  tournament: { id: string; name: string; level: TournamentLevel; city: string }
}

// in-app notification: the text is built on the site from type + data (RU/KZ)
export interface AppNotification {
  id: string
  type: string // participant.* | judge.* | organizer.* | admin.*
  data: Record<string, unknown>
  link?: string
  read: boolean
  createdAt: string
  recipient?: { name: string; email: string } // admin platform feed only
}

export interface MyTournament extends Tournament {
  moderation: ModerationStatus
  moderationNote?: string
  myRole: OrganizerRole
}

export interface InvitePreview {
  kind: 'judge' | 'co_organizer'
  state: 'valid' | 'used' | 'expired' | 'declined'
  invitedBy: string
  expiresAt: string
  forEmail?: string // invites by email: masked address of the invited person
  tournament: { id: string; name: string; city: string; startDate: string; endDate: string; cover: string }
}

// ---------- find a teammate ----------
export type TeammateKind = 'team_needed' | 'speaker_needed'
export interface TeammatePost {
  id: string
  kind: TeammateKind
  city: string
  level: 'school' | 'university'
  languages: ('ru' | 'kz' | 'en')[]
  text: string
  createdAt: string
  expiresAt: string
  author: { name: string; institution?: string }
  replies: number
  own: boolean
  replied: boolean
}

// ---------- safeguarding ----------
export type SafetyCategory = 'bullying' | 'harassment' | 'inappropriate' | 'threat' | 'other'
export type SafetyStatus = 'open' | 'in_progress' | 'resolved'
export interface MySafetyReport { id: string; category: SafetyCategory; status: SafetyStatus; createdAt: string; resolutionNote?: string }
export interface SafetyReport extends MySafetyReport {
  about?: string
  place?: string
  description: string
  anonymous: boolean
  reporter?: { name: string; email: string }
  handledBy?: string
}

// ---------- plans & Kaspi QR payments ----------
export type PaymentStatus = 'awaiting' | 'pending' | 'confirmed' | 'rejected'
export interface KaspiInfo { recipient?: string; phone?: string; qrUrl?: string; note?: string }
export interface TournamentPayment {
  required: boolean
  paid: boolean
  freeTeamLimit: number
  amount?: number
  reference?: string
  status?: PaymentStatus
  payerNote?: string
  adminNote?: string
  kaspi?: KaspiInfo
  id?: string
  hasReceipt?: boolean
}
export interface AdminPayment {
  id: string
  amount: number
  reference: string
  status: PaymentStatus
  payerNote?: string
  adminNote?: string
  paidAt?: string
  handledAt?: string
  handledBy?: string
  tournament: { id: string; name: string; maxTeams: number }
  hasReceipt?: boolean
  payer?: { name: string; email: string }
}
export interface PlatformSettings extends KaspiInfo { proPrice: number; freeTeamLimit: number }

export interface EmailInvite {
  id: string
  email: string
  kind: 'judge' | 'co_organizer'
  state: 'pending' | 'accepted' | 'declined' | 'expired'
  acceptedBy?: string
  createdAt: string
}

// ---------- clubs ----------
export interface Ref { id: string; name: string }
export interface ClubSummary { id: string; name: string; city: string; institution?: string; logoUrl?: string; members: number; teams: number }
export interface ClubMemberInfo { id: string; name: string; avatarUrl?: string; teamId?: string }
export interface ClubDetails {
  id: string
  name: string
  city: string
  institution?: string
  description: string
  createdAt: string
  logoUrl?: string
  status?: 'pending' | 'approved' | 'rejected' // a new club waits for an admin
  moderationNote?: string // why it was rejected (members and admins)
  teams: { id: string; name: string; logoUrl?: string; members: ClubMemberInfo[] }[]
  members: ClubMemberInfo[]
  isMember: boolean
  joinCode?: string // members only
  pendingRequests?: number // members only: requests waiting for an answer
  myRequest?: string // the viewer's open request to join
  log?: { id: string; userName: string; action: string; detail: string; createdAt: string }[]
}

// ---------- news ----------
export interface NewsItem {
  id: string
  title: string
  summary: string
  body?: string // only on the article page
  coverUrl?: string
  published: boolean
  publishedAt?: string
  updatedAt: string
  author?: string
}

// a request to join a club (sent from the public club page)
export interface ClubJoinRequest {
  id: string
  message: string
  createdAt: string
  user: { id: string; name: string; avatarUrl?: string; institution?: string; city?: string }
}
