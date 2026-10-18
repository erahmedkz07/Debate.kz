import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Crown, FileSpreadsheet, Printer } from 'lucide-react'
import { NotFoundError } from '@/api'
import { useAsync } from '@/lib/hooks'
import { useSides, useFormatName } from '@/lib/formats'
import { useRoundName } from '@/lib/rounds'
import { buildReport, downloadXlsx, loadReport, type Table } from '@/lib/report'
import { cn, formatDateRange } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ErrorState, Skeleton } from '@/components/ui/states'
import { Logo } from '@/components/brand'
import NotFound from './NotFound'

// A printable report of the tournament's results (the browser saves it as PDF), for the organizer's management:
// the champions, then for each league its final places, table, speakers, playoffs and rounds, and the judges.
// Long tables flow across pages (their header repeats on each page); a heading never stays alone at a page's foot.
// The same tables go into the Excel file.
export default function TournamentReport() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => loadReport(id), [id])
  const sides = useSides(data?.details.format)
  const formatName = useFormatName(data?.details.format)
  const roundName = useRoundName()
  if (error instanceof NotFoundError) return <NotFound />
  if (error) return <div className="p-10"><ErrorState onRetry={reload} /></div>
  if (loading || !data) return <div className="mx-auto max-w-4xl space-y-3 p-10"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>
  const report = buildReport(data, { t, sides, roundName })
  const d = data.details
  const leagues = report.groups.length > 1
  const champions = report.groups.filter(g => g.champion)
  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 print:bg-white">
      {/* A4 portrait with even margins; colours kept on paper */}
      <style>{'@page { size: A4; margin: 14mm 12mm; } @media print { html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }'}</style>
      <div className="mx-auto max-w-[210mm] p-4 sm:p-8 print:max-w-none print:p-0">
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2 print:hidden">
          <Button variant="outline" onClick={() => void downloadXlsx(data, report, t)}><FileSpreadsheet className="size-4" />{t('export.excel')}</Button>
          <Button onClick={() => window.print()}><Printer className="size-4" />{t('export.print')}</Button>
        </div>
        <article className="rounded-xl bg-white p-6 shadow-sm sm:p-10 print:rounded-none print:p-0 print:shadow-none">
          <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">{t('report.title')}</p>
              <h1 className="mt-1 text-2xl font-extrabold leading-tight">{d.name}</h1>
              <p className="mt-1 text-sm text-slate-600">{formatDateRange(d.startDate, d.endDate)} · {d.city}{d.venue ? `, ${d.venue}` : ''}</p>
              <p className="text-sm text-slate-600">{formatName.full} · {t(`level.${d.level}`)} · {t('tournament.organizer')}: {d.organizer}</p>
            </div>
            <div className="shrink-0"><Logo /></div>
          </header>

          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {([['teams', report.summary.teams], ['judges', report.summary.judges], ['rounds', report.summary.rounds]] as const).map(([k, n]) => (
              <div key={k} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t(`report.summary.${k}`)}</dt>
                <dd className="text-xl font-extrabold tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>

          {champions.length > 0 && (
            <div className={cn('mt-4 grid gap-2', champions.length > 1 && 'sm:grid-cols-2 print:grid-cols-2')}>
              {champions.map(g => (
                <p key={g.key} className="flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm font-bold">
                  <Crown className="size-5 shrink-0 text-amber-500" />
                  <span>{g.name ? `${t('report.championOf', { league: g.name })}: ` : `${t('playoff.champion')}: `}{g.champion}</span>
                </p>
              ))}
            </div>
          )}

          {report.groups.map((g, gi) => (
            <section key={g.key || 'all'} className={cn(leagues && gi > 0 && 'print:break-before-page')}>
              {leagues && <h2 className="mt-8 rounded-lg bg-slate-900 px-4 py-2 text-base font-extrabold uppercase tracking-wider text-white">{g.name}</h2>}
              {g.tables.filter(tb => tb.rows.length).map(tb => <ReportTable key={tb.key} tb={tb} />)}
            </section>
          ))}
          {report.judges && <section className="print:break-before-page"><ReportTable tb={report.judges} /></section>}

          <footer className="mt-10 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
            {t('export.generated', { date: new Date().toLocaleString() })} · debate.kz
          </footer>
        </article>
      </div>
    </div>
  )
}

// one table of the report: numbers right-aligned, the first rows of the final places highlighted
function ReportTable({ tb }: { tb: Table }) {
  const numeric = tb.header.map((_, i) => i > 0 && tb.rows.every(r => typeof r[i] === 'number' || r[i] === ''))
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-sky-800 [break-after:avoid]">{tb.title}</h3>
      {/* a phone scrolls a wide table sideways; on paper it fits the page */}
      <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full min-w-[480px] border-collapse text-[11px] leading-snug print:min-w-0">
        <thead className="[display:table-header-group]">
          <tr>{tb.header.map((h, i) => <th key={i} className={cn('border-b-2 border-slate-800 bg-slate-100 px-2 py-1.5 text-left font-bold', numeric[i] && 'text-right')}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {tb.rows.map((r, i) => (
            <tr key={i} className={cn('break-inside-avoid border-b border-slate-200', i % 2 === 1 && 'bg-slate-50',
              tb.key === 'places' && (r[0] === '1' ? 'bg-amber-50 font-bold' : r[0] === '2' ? 'font-semibold' : ''))}>
              {r.map((c, j) => <td key={j} className={cn('px-2 py-1 align-top', numeric[j] && 'text-right tabular-nums', j === 0 && 'w-10 font-semibold')}>{typeof c === 'number' && !Number.isInteger(c) ? c.toFixed(1) : c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
