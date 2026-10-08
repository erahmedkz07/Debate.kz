// Debate formats a tournament can run. WSDC, APF, Karl Popper, Lincoln–Douglas (one against one), Public Forum,
// Asian Parliamentary and Australs have two teams per debate (proposition/government and opposition): they differ in
// team size, score ranges and reply speeches. British Parliamentary puts four teams
// of two in a room (Opening/Closing Government and Opposition); teams are ranked 1st–4th and earn 3/2/1/0 points.

export const FORMAT_CODES = ['WSDC', 'APF', 'POPPER', 'BP', 'LD', 'PF', 'ASIAN', 'AUSTRALS'] as const
export type FormatCode = (typeof FORMAT_CODES)[number]

export interface FormatRules {
  teams: 2 | 4 // teams per debate
  speakers: number // speakers per team
  speaker: [number, number] // substantive speech score range
  reply?: { range: [number, number]; by: number[] } // reply / rebuttal speech: its range and which speakers may give it
  step: number
}

export const FORMAT_RULES: Record<FormatCode, FormatRules> = {
  // World Schools: 3 speakers, 60–80; the reply (30–40) is given by the 1st or 2nd speaker
  WSDC: { teams: 2, speakers: 3, speaker: [60, 80], reply: { range: [30, 40], by: [1, 2] }, step: 0.5 },
  // American parliamentary (APF): 2 speakers, 20–30; the rebuttal (10–15) is given by the team leader
  APF: { teams: 2, speakers: 2, speaker: [20, 30], reply: { range: [10, 15], by: [1] }, step: 0.5 },
  // Karl Popper: 3 speakers, 15–30 in whole points; no reply speeches (cross-examinations are part of the speakers' scores)
  POPPER: { teams: 2, speakers: 3, speaker: [15, 30], step: 1 },
  // British Parliamentary: 4 teams of 2, 50–100 in whole points, no reply speeches; the panel agrees on one ballot
  BP: { teams: 4, speakers: 2, speaker: [50, 100], step: 1 },
  // Lincoln–Douglas: one against one, 26–30; rebuttals are part of the debater's own score
  LD: { teams: 2, speakers: 1, speaker: [26, 30], step: 0.5 },
  // Public Forum: teams of two, 26–30; summaries and final focus are part of the speakers' scores
  PF: { teams: 2, speakers: 2, speaker: [26, 30], step: 0.5 },
  // Asian Parliamentary: 3 speakers, 70–80; the reply (35–40) by the 1st or 2nd speaker
  ASIAN: { teams: 2, speakers: 3, speaker: [70, 80], reply: { range: [35, 40], by: [1, 2] }, step: 0.5 },
  // Australs: 3 speakers, 60–80, no reply speeches
  AUSTRALS: { teams: 2, speakers: 3, speaker: [60, 80], step: 0.5 },
}

export const rulesOf = (format: string): FormatRules => FORMAT_RULES[format as FormatCode] ?? FORMAT_RULES.WSDC

// the score ranges a new tournament starts with (stored per tournament in scoring_configs)
export const scoringDefaults = (format: string) => {
  const r = rulesOf(format)
  return { speakerMin: r.speaker[0], speakerMax: r.speaker[1], replyMin: r.reply?.range[0] ?? 0, replyMax: r.reply?.range[1] ?? 0, step: r.step }
}

export type SideCode = 'proposition' | 'opposition' | 'closingProposition' | 'closingOpposition'
export const TWO_SIDES = ['proposition', 'opposition'] as const satisfies readonly SideCode[]
export const BP_SIDES = ['proposition', 'opposition', 'closingProposition', 'closingOpposition'] as const satisfies readonly SideCode[]
export const sidesOf = (format: string): readonly SideCode[] => (rulesOf(format).teams === 4 ? BP_SIDES : TWO_SIDES)
export const isBP = (format: string) => rulesOf(format).teams === 4
// BP team points by place: 1st 3, 2nd 2, 3rd 1, 4th 0
export const BP_POINTS = [3, 2, 1, 0]

// the team that speaks on a side of a debate row
interface DebateTeams { propositionTeamId: string; oppositionTeamId: string; closingPropositionTeamId?: string | null; closingOppositionTeamId?: string | null }
export const teamOnSide = (d: DebateTeams, side: SideCode) => ({
  proposition: d.propositionTeamId, opposition: d.oppositionTeamId,
  closingProposition: d.closingPropositionTeamId ?? null, closingOpposition: d.closingOppositionTeamId ?? null,
})[side]
// every (side, team) of the debate: two in two-team formats, four in BP
export const sidesInDebate = (d: DebateTeams) =>
  BP_SIDES.map(side => ({ side, teamId: teamOnSide(d, side) })).filter((x): x is { side: SideCode; teamId: string } => !!x.teamId)

// the side as a participant reads it: in BP the opening half is named explicitly (Opening Government …)
export const sideLabel = (side: SideCode, bp: boolean) =>
  bp && side === 'proposition' ? 'openingProposition' : bp && side === 'opposition' ? 'openingOpposition' : side
// a finished debate for one side: 'win' / 'loss', and in BP also the place 1–4
export const placeOf = (d: { ranking: SideCode[] }, side: SideCode) => (d.ranking.length ? d.ranking.indexOf(side) + 1 : undefined)
export const resultOf = (d: { winner: SideCode | null; ranking: SideCode[] }, side: SideCode) =>
  d.ranking.length ? `place${d.ranking.indexOf(side) + 1}` : d.winner ? (d.winner === side ? 'win' : 'loss') : null
// the two camps of a debate for short texts: government teams vs opposition teams (BP: two names on each side)
export const campNames = (d: { proposition: { name: string }; opposition: { name: string }; closingProposition?: { name: string } | null; closingOpposition?: { name: string } | null }) => ({
  proposition: [d.proposition.name, d.closingProposition?.name].filter(Boolean).join(', '),
  opposition: [d.opposition.name, d.closingOpposition?.name].filter(Boolean).join(', '),
})
