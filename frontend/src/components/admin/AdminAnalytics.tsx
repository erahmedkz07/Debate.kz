import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BarChart3, MapPin, Repeat, Star, Trophy, Users } from 'lucide-react'
import { getAdminAnalytics, type PlatformAnalytics } from '@/api'
import { useAsync } from '@/lib/hooks'
import { regionByCode } from '@/content/geo'
import { Card } from '@/components/ui/card'
import { ErrorState, Skeleton } from '@/components/ui/states'

// Platform analytics for the admins: growth by month, geography, formats, returning participants and how tournaments go.
// Aggregates only; nothing personal is collected for it (no gender, no age).
export function AdminAnalytics() {
  const { t, i18n } = useTranslation()
  const { data, loading, error, reload } = useAsync(getAdminAnalytics)
  if (error) return <ErrorState onRetry={reload} />
  if (loading || !data) return <Skeleton className="h-96" />
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const region = (code: string) => regionByCode(code)?.[lang] ?? t(`analytics.region.${code === 'unknown' ? 'unknown' : 'other'}`)
  const month = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(lang === 'kz' ? 'kk-KZ' : 'ru-RU', { month: 'short' }).replace('.', '') + ` ’${m.slice(2, 4)}`
  const d = data

  const kpis = [
    { label: t('analytics.kpi.users'), value: d.totals.users },
    { label: t('analytics.kpi.tournaments'), value: d.totals.tournaments },
    { label: t('analytics.kpi.teams'), value: d.totals.teams },
    { label: t('analytics.kpi.active'), value: d.people.active, hint: t('analytics.kpi.activeHint') },
    { label: t('analytics.kpi.returning'), value: `${d.people.returningShare}%`, hint: t('analytics.kpi.returningHint', { count: d.people.returning }) },
    { label: t('analytics.kpi.completion'), value: d.tournaments.completion === null ? '—' : `${d.tournaments.completion}%`, hint: t('analytics.kpi.completionHint') },
    { label: t('analytics.kpi.rating'), value: d.quality.rating ?? '—', hint: t('analytics.kpi.ratingHint', { count: d.quality.reviews }) },
    { label: t('analytics.kpi.clubs'), value: d.totals.clubs, hint: t('analytics.kpi.clubsHint', { share: d.totals.inClubs }) },
  ]

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t('analytics.intro')}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(k => (
          <Card key={k.label} className="p-4">
            <p className="text-2xl font-extrabold tabular-nums">{k.value}</p>
            <p className="text-sm font-medium">{k.label}</p>
            {k.hint && <p className="mt-0.5 text-xs text-muted-foreground">{k.hint}</p>}
          </Card>
        ))}
      </div>

      <Section icon={<BarChart3 className="size-5 text-primary" />} title={t('analytics.growth')}>
        <MonthChart months={d.months} month={month} />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section icon={<MapPin className="size-5 text-primary" />} title={t('analytics.regions')}>
          <Bars rows={d.regions.map(r => ({ label: region(r.key), value: r.teams, note: t('analytics.regionNote', { tournaments: r.tournaments, teams: r.teams }) }))} empty={t('analytics.empty')} />
        </Section>
        <Section icon={<Users className="size-5 text-primary" />} title={t('analytics.usersByRegion')}>
          <Bars rows={d.usersByRegion.map(r => ({ label: region(r.key), value: r.count }))} empty={t('analytics.empty')} />
        </Section>
        <Section icon={<Trophy className="size-5 text-primary" />} title={t('analytics.tournaments')}>
          <div className="space-y-5">
            <Bars rows={d.tournaments.byStatus.map(r => ({ label: t(`analytics.status.${r.key}`), value: r.count }))} empty={t('analytics.empty')} />
            <Bars rows={d.tournaments.byLevel.map(r => ({ label: t(`level.${r.key}`), value: r.count }))} empty="" />
            <Bars rows={d.tournaments.byFormat.map(r => ({ label: r.key, value: r.count }))} empty="" />
            <p className="text-sm text-muted-foreground">
              {t('analytics.tournamentFacts', { online: d.tournaments.online, pro: d.tournaments.pro, teams: d.tournaments.averageTeams ?? '—', applications: d.tournaments.averageApplications ?? '—', strikes: d.tournaments.activeStrikes })}
            </p>
          </div>
        </Section>
        <Section icon={<Repeat className="size-5 text-primary" />} title={t('analytics.people')}>
          <ul className="space-y-2 text-sm">
            <Fact label={t('analytics.fact.speakerSlots')} value={d.totals.speakerSlots} />
            <Fact label={t('analytics.fact.judgeSlots')} value={d.totals.judgeSlots} />
            <Fact label={t('analytics.fact.returning')} value={`${d.people.returning} / ${d.people.active}`} />
            <Fact label={t('analytics.fact.withoutAccount')} value={`${d.people.withoutAccount}%`} />
            <Fact label={t('analytics.fact.telegram')} value={`${d.totals.telegram}%`} />
            <Fact label={t('analytics.fact.inClubs')} value={`${d.totals.inClubs}%`} />
          </ul>
        </Section>
      </div>

      <Section icon={<Star className="size-5 text-primary" />} title={t('analytics.topClubs')}>
        {d.topClubs.length === 0 ? <p className="text-sm text-muted-foreground">{t('analytics.empty')}</p> : (
          <ol className="divide-y divide-border">
            {d.topClubs.map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="w-6 text-right font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                <Link to={`/clubs/${c.id}`} className="min-w-0 flex-1 truncate font-semibold hover:text-primary">{c.name}</Link>
                <span className="text-muted-foreground">{c.city}</span>
                <span className="w-40 text-right tabular-nums">{t('analytics.clubNote', { entries: c.entries, members: c.members })}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="mb-4 flex items-center gap-2 font-bold">{icon}{title}</h3>
      {children}
    </Card>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return <li className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><b className="tabular-nums">{value}</b></li>
}

function Bars({ rows, empty }: { rows: { label: string; value: number; note?: string }[]; empty: string }) {
  if (!rows.length) return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null
  const max = Math.max(...rows.map(r => r.value), 1)
  return (
    <ul className="space-y-2">
      {rows.map(r => (
        <li key={r.label} className="text-sm" title={r.note}>
          <div className="flex justify-between gap-3"><span className="truncate">{r.label}</span><span className="tabular-nums text-muted-foreground">{r.note ?? r.value}</span></div>
          <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

// 12 months: columns of new accounts and teams, the number of tournaments above each month
function MonthChart({ months, month }: { months: PlatformAnalytics['months']; month: (m: string) => string }) {
  const { t } = useTranslation()
  const max = Math.max(...months.flatMap(m => [m.users, m.teams]), 1)
  return (
    <>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-primary" />{t('analytics.legend.users')}</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-accent" />{t('analytics.legend.teams')}</span>
        <span>{t('analytics.legend.tournaments')}</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <div className="flex min-w-[560px] items-end gap-2" style={{ height: 180 }}>
          {months.map(m => (
            <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={t('analytics.monthTitle', { users: m.users, tournaments: m.tournaments, teams: m.teams, speakers: m.speakers })}>
              <span className="text-[11px] font-bold tabular-nums">{m.tournaments || ''}</span>
              <div className="flex w-full items-end justify-center gap-0.5" style={{ height: 140 }}>
                <div className="w-1/2 max-w-4 rounded-t bg-primary" style={{ height: `${(m.users / max) * 100}%` }} />
                <div className="w-1/2 max-w-4 rounded-t bg-accent" style={{ height: `${(m.teams / max) * 100}%` }} />
              </div>
              <span className="text-[11px] text-muted-foreground">{month(m.month)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
