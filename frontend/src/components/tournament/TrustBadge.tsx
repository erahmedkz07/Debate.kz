import { useTranslation } from 'react-i18next'
import { BadgeCheck, Shield, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { TrustLevel } from '@/types'
import { Badge } from '@/components/ui/badge'

export const trustLook: Record<TrustLevel, { icon: typeof Shield; variant: 'muted' | 'primary' | 'success' | 'danger'; tile: string }> = {
  new: { icon: Shield, variant: 'muted', tile: 'bg-muted text-muted-foreground' },
  trusted: { icon: ShieldCheck, variant: 'primary', tile: 'bg-primary-soft text-primary' },
  verified: { icon: BadgeCheck, variant: 'success', tile: 'bg-success-soft text-success' },
  restricted: { icon: ShieldAlert, variant: 'danger', tile: 'bg-danger-soft text-danger' },
}

// organizer trust: decides whether new tournaments need admin review
export function TrustBadge({ level }: { level?: TrustLevel }) {
  const { t } = useTranslation()
  if (!level) return null
  const { icon: Icon, variant } = trustLook[level]
  return <Badge variant={variant}><Icon className="size-3" />{t(`trust.levels.${level}`)}</Badge>
}
