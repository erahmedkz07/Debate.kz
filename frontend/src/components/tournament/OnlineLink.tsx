import { useTranslation } from 'react-i18next'
import { Video } from 'lucide-react'
import { cn } from '@/lib/utils'

// The online room of a debate (Zoom, Meet, Teams): opens in a new tab
export function OnlineLink({ url, className, label }: { url?: string; className?: string; label?: string }) {
  const { t } = useTranslation()
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className={cn('inline-flex items-center gap-1.5 font-semibold text-primary hover:underline', className)}>
      <Video className="size-4 shrink-0" />{label ?? t('online.join')}
    </a>
  )
}
