import { useTranslation } from 'react-i18next'
import type { PlayoffStage } from '@/types'

// Round names in the reader's language. The API stores Russian names ("Раунд 2", "Полуфинал") for the bot and letters;
// the site shows "Раунд 2 / 2-раунд" and the playoff stages through the dictionary.
const STAGE_BY_NAME: Record<string, PlayoffStage> = { 'Финал': 'final', 'Полуфинал': 'semi', 'Четвертьфинал': 'quarter', '1/8 финала': 'octo' }

export function useRoundName() {
  const { t } = useTranslation()
  return (r: { name: string; number?: number; stage?: PlayoffStage }) => {
    const stage = r.stage ?? STAGE_BY_NAME[r.name]
    if (stage) return t(`playoff.stages.${stage}`)
    const n = /^Раунд (\d+)$/.exec(r.name)?.[1]
    return n ? t('ballot.round', { n }) : r.name
  }
}
