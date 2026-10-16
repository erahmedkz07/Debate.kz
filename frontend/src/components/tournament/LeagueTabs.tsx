import { useTranslation } from 'react-i18next'
import type { League } from '@/types'
import { cn } from '@/lib/utils'

// Leagues inside one tournament (a Russian and a Kazakh league): a row of pills to show one league at a time.
// `all` adds an "All" pill first (teams, the draw); the tables have no "All", a league ranks on its own.
export function LeagueTabs({ leagues, value, onChange, all, className }: { leagues: League[]; value: string; onChange: (key: string) => void; all?: boolean; className?: string }) {
  const { t } = useTranslation()
  const items = [...(all ? [{ key: '', name: t('common.all') }] : []), ...leagues]
  return (
    <div className={cn('flex flex-wrap gap-1 rounded-2xl bg-muted p-1', className)} role="group" aria-label={t('leagues.title')}>
      {items.map(l => (
        <button key={l.key || 'all'} type="button" aria-pressed={value === l.key} onClick={() => onChange(l.key)}
          className={cn('cursor-pointer rounded-xl px-3.5 py-2 text-sm font-semibold transition-all', value === l.key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          {l.name}
        </button>
      ))}
    </div>
  )
}

export const leagueName = (leagues: League[] | undefined, key?: string) => leagues?.find(l => l.key === key)?.name
