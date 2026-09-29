import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Crown, FileSpreadsheet, Printer } from 'lucide-react'
import { NotFoundError } from '@/api'
import { useAsync } from '@/lib/hooks'
import { useSides, useFormatName } from '@/lib/formats'
import { useRoundName } from '@/lib/rounds'
import { buildTables, downloadXlsx, loadReport } from '@/lib/report'
import { formatDateRange } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ErrorState, Skeleton } from '@/components/ui/states'
import { Logo } from '@/components/brand'
import NotFound from './NotFound'

// A printable report of the tournament's results (the browser saves it as PDF): standings, speakers, playoffs, rounds.
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
  const tables = buildTables(data, { t, sides, roundName })
  const d = data.details
  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <div className="mx-auto max-w-4xl p-6 sm:p-10 print:max-w-none print:p-0">
        <div className="mb-6 flex flex-wrap items-center justify-end gap-2 print:hidden">
          <Button variant="outline" onClick={() => void downloadXlsx(data, tables)}><FileSpreadsheet className="size-4" />{t('export.excel')}</Button>
          <Button onClick={() => window.print()}><Printer className="size-4" />{t('export.print')}</Button>
        </div>
        <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-4">
          <div>
            <h1 className="text-2xl font-extrabold">{d.name}</h1>
            <p className="mt-1 text-sm text-slate-600">{formatDateRange(d.startDate, d.endDate)} · {d.city} · {formatName.full} · {t(`level.${d.level}`)}</p>
            <p className="text-sm text-slate-600">{t('tournament.organizer')}: {d.organizer}</p>
          </div>
          <Logo />
        </header>
        {data.bracket?.champion && (
          <p className="mt-5 flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 font-bold">
            <Crown className="size-5 text-amber-500" />{t('playoff.champion')}: {data.bracket.champion.name}
          </p>
        )}
        {tables.filter(tb => tb.rows.length).map(tb => (
          <section key={tb.key} className="mt-8 break-inside-avoid-page">
            <h2 className="mb-2 text-lg font-bold">{tb.title}</h2>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>{tb.header.map((h, i) => <th key={i} className="border border-slate-300 bg-slate-100 px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {tb.rows.map((r, i) => (
                  <tr key={i} className="break-inside-avoid">{r.map((c, j) => <td key={j} className="border border-slate-300 px-2 py-1 align-top">{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        <p className="mt-10 text-[10px] text-slate-500">{t('export.generated', { date: new Date().toLocaleString() })} · debate.kz</p>
      </div>
    </div>
  )
}
