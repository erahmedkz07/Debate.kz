import { useTranslation } from 'react-i18next'
import { formatOfTournament } from '@/content/formats'
import type { Debate, Side } from '@/types'

export const BP_SIDES: Side[] = ['proposition', 'opposition', 'closingProposition', 'closingOpposition']
export const TWO_SIDES: Side[] = ['proposition', 'opposition']
export const isBP = (format?: string) => format === 'BP'
// the sides of a debate in speaking order: two, or four in British Parliamentary
export const sidesOf = (format?: string) => (isBP(format) ? BP_SIDES : TWO_SIDES)
export const teamIdOn = (d: Debate, side: Side) => ({
  proposition: d.propositionTeamId, opposition: d.oppositionTeamId,
  closingProposition: d.closingPropositionTeamId, closingOpposition: d.closingOppositionTeamId,
})[side]
// BP: the place (1–4) a side took; undefined before the result
export const placeOf = (d: Debate, side: Side) => (d.ranking?.length ? d.ranking.indexOf(side) + 1 : undefined)
export const BP_POINTS = [3, 2, 1, 0]

// The sides of a debate as the tournament's format calls them:
// WSDC and APF — Government / Opposition, Karl Popper — Affirmative / Negative,
// BP — Opening / Closing Government and Opposition.
export function useSides(format?: string): Record<Side, string> {
  const { i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const f = formatOfTournament(format)
  const name = (i: number) => f.sides[i]?.[lang] ?? ''
  return { proposition: name(0), opposition: name(1), closingProposition: name(2), closingOpposition: name(3) }
}

// the format's short and full name for badges and facts
export function useFormatName(format?: string) {
  const { i18n } = useTranslation()
  const f = formatOfTournament(format)
  return { short: f.short, full: f.name[i18n.language === 'kz' ? 'kz' : 'ru'], speakers: f.score.speakersPerTeam }
}
