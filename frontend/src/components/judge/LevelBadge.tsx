import { useTranslation } from 'react-i18next'
import { Award, Crown, Gavel, Sprout } from 'lucide-react'
import type { JudgeLevel } from '@/types'
import { Badge } from '@/components/ui/badge'

const look: Record<JudgeLevel, { icon: typeof Gavel; variant: 'muted' | 'primary' | 'success' | 'accent' }> = {
  novice: { icon: Sprout, variant: 'muted' },
  judge: { icon: Gavel, variant: 'primary' },
  experienced: { icon: Award, variant: 'success' },
  chief: { icon: Crown, variant: 'accent' },
}

// earned judge level (judges without an account have none, so nothing is shown)
export function LevelBadge({ level, className }: { level?: JudgeLevel; className?: string }) {
  const { t } = useTranslation()
  if (!level) return null
  const { icon: Icon, variant } = look[level]
  return <Badge variant={variant} className={className}><Icon className="size-3" />{t(`judgeLevel.${level}`)}</Badge>
}
