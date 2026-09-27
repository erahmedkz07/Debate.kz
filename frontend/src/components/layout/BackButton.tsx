import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

// "Back": returns to the page the person came from inside the site; when the page was opened directly
// (a link from Telegram, a bookmark) there is no such page, so it goes to `fallback` instead of leaving the site.
export function BackButton({ fallback, label, className }: { fallback: string; label?: string; className?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const back = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(fallback)
  }
  return (
    <button type="button" onClick={back}
      className={cn('inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl pr-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary', className)}>
      <ArrowLeft className="size-4" />{label ?? t('common.back')}
    </button>
  )
}
