// Debate formats a tournament can run. Every format here has two teams per debate (proposition/government and
// opposition), so the draw, check-in and standings work the same way; what changes is the team size, the score
// ranges and whether there are reply speeches. British Parliamentary (four teams per room) comes separately.

export const FORMAT_CODES = ['WSDC', 'APF', 'POPPER'] as const
export type FormatCode = (typeof FORMAT_CODES)[number]

export interface FormatRules {
  speakers: number // speakers per team
  speaker: [number, number] // substantive speech score range
  reply?: { range: [number, number]; by: number[] } // reply / rebuttal speech: its range and which speakers may give it
  step: number
}

export const FORMAT_RULES: Record<FormatCode, FormatRules> = {
  // World Schools: 3 speakers, 60–80; the reply (30–40) is given by the 1st or 2nd speaker
  WSDC: { speakers: 3, speaker: [60, 80], reply: { range: [30, 40], by: [1, 2] }, step: 0.5 },
  // American parliamentary (APF): 2 speakers, 20–30; the rebuttal (10–15) is given by the team leader
  APF: { speakers: 2, speaker: [20, 30], reply: { range: [10, 15], by: [1] }, step: 0.5 },
  // Karl Popper: 3 speakers, 15–30 in whole points; no reply speeches (cross-examinations are part of the speakers' scores)
  POPPER: { speakers: 3, speaker: [15, 30], step: 1 },
}

export const rulesOf = (format: string): FormatRules => FORMAT_RULES[format as FormatCode] ?? FORMAT_RULES.WSDC

// the score ranges a new tournament starts with (stored per tournament in scoring_configs)
export const scoringDefaults = (format: string) => {
  const r = rulesOf(format)
  return { speakerMin: r.speaker[0], speakerMax: r.speaker[1], replyMin: r.reply?.range[0] ?? 0, replyMax: r.reply?.range[1] ?? 0, step: r.step }
}
