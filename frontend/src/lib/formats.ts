import { useTranslation } from 'react-i18next'
import { formatOfTournament } from '@/content/formats'

// The two sides of a debate as the tournament's format calls them:
// WSDC and APF — Government / Opposition, Karl Popper — Affirmative / Negative.
export function useSides(format?: string) {
  const { i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const f = formatOfTournament(format)
  return { proposition: f.sides[0][lang], opposition: f.sides[1][lang] }
}

// the format's short and full name for badges and facts
export function useFormatName(format?: string) {
  const { i18n } = useTranslation()
  const f = formatOfTournament(format)
  return { short: f.short, full: f.name[i18n.language === 'kz' ? 'kz' : 'ru'], speakers: f.score.speakersPerTeam }
}
