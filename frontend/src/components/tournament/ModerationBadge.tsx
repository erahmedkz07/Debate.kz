import { useTranslation } from 'react-i18next'
import { Clock, Flag, ShieldX } from 'lucide-react'
import type { ModerationStatus } from '@/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

// Small badge on tournament cards; approved tournaments need no badge
export function ModerationBadge({ status, hold }: { status?: ModerationStatus; hold?: boolean }) {
  const { t } = useTranslation()
  if (hold && status === 'approved') return <Badge variant="danger"><Flag className="size-3" />{t('moderation.hold')}</Badge>
  if (!status || status === 'approved') return null
  return (
    <Badge variant={status === 'pending' ? 'accent' : 'danger'}>
      {status === 'pending' ? <Clock className="size-3" /> : <ShieldX className="size-3" />}{t(`moderation.${status}`)}
    </Badge>
  )
}

// Explains to organizers why their tournament is not public yet
export function ModerationBanner({ status, note, hold, className }: { status?: ModerationStatus; note?: string; hold?: boolean; className?: string }) {
  const { t } = useTranslation()
  if (hold && status === 'approved') {
    return (
      <div className={cn('flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger-soft p-4 text-sm', className)}>
        <Flag className="mt-0.5 size-5 shrink-0 text-danger" />
        <div>
          <p className="font-bold">{t('moderation.holdTitle')}</p>
          <p className="mt-0.5 text-muted-foreground">{t('moderation.holdText')}</p>
        </div>
      </div>
    )
  }
  if (!status || status === 'approved') return null
  const pending = status === 'pending'
  return (
    <div className={cn('flex items-start gap-3 rounded-2xl border p-4 text-sm', pending ? 'border-accent bg-accent-soft' : 'border-danger/40 bg-danger-soft', className)}>
      {pending ? <Clock className="mt-0.5 size-5 shrink-0 text-navy dark:text-accent" /> : <ShieldX className="mt-0.5 size-5 shrink-0 text-danger" />}
      <div>
        <p className="font-bold">{t(`moderation.${status}Title`)}</p>
        <p className="mt-0.5 text-muted-foreground">{pending ? t('moderation.pendingText') : t('moderation.rejectedText', { reason: note ?? '—' })}</p>
      </div>
    </div>
  )
}
