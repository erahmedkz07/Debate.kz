import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Calculator, CheckCircle2, CircleHelp, ShieldCheck, Trophy, XCircle } from 'lucide-react'
import { calculateBreak, type CalcFormat } from '@/lib/breakCalculator'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { BackButton } from '@/components/layout/BackButton'

// Break calculator: how many wins (BP: team points) a team needs to make the break.
// The inputs live in the address, so a link shares the exact calculation.
const limits = { teams: [4, 400], rounds: [1, 12], breakSize: [2, 64] } as const

export default function BreakCalculator() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const num = (k: keyof typeof limits, d: number) => {
    const v = Number(params.get(k))
    return Number.isFinite(v) && v >= limits[k][0] && v <= limits[k][1] ? Math.round(v) : d
  }
  const format: CalcFormat = params.get('format') === 'bp' ? 'bp' : 'two'
  const teams = num('teams', 32), rounds = num('rounds', 5), breakSize = Math.min(num('breakSize', 8), teams)
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }) }
  const result = useMemo(() => calculateBreak({ teams, rounds, breakSize, format }), [teams, rounds, breakSize, format])
  const unit = (n: number) => t(format === 'bp' ? 'breakCalc.points' : 'breakCalc.wins', { count: n })
  const maxRow = Math.max(...result.distribution.map(d => d.teams))

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-4xl">
        <BackButton fallback="/tools" className="-ml-1 mb-2" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">{t('breakCalc.title')}</h1>
          <Link to="/calculator" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><Calculator className="size-4" />{t('breakCalc.toScores')}</Link>
        </div>
        <p className="mt-1 text-muted-foreground">{t('breakCalc.subtitle')}</p>

        <Card className="mt-6 grid grid-cols-1 gap-4 p-5 sm:grid-cols-4">
          <div className="sm:col-span-4">
            <Label>{t('breakCalc.format')}</Label>
            <div className="mt-1 inline-flex rounded-xl bg-muted p-1" role="radiogroup" aria-label={t('breakCalc.format')}>
              {(['two', 'bp'] as const).map(f => (
                <button key={f} type="button" role="radio" aria-checked={format === f} onClick={() => set('format', f)}
                  className={cn('cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold transition-all', format === f ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground')}>
                  {t(`breakCalc.formats.${f}`)}
                </button>
              ))}
            </div>
          </div>
          {([['teams', teams], ['rounds', rounds], ['breakSize', breakSize]] as const).map(([k, v]) => (
            <div key={k}>
              <Label htmlFor={`bc-${k}`}>{t(`breakCalc.${k}`)}</Label>
              <Input id={`bc-${k}`} type="number" inputMode="numeric" min={limits[k][0]} max={k === 'breakSize' ? teams : limits[k][1]} value={v}
                onChange={e => e.target.value && set(k, e.target.value)} />
            </div>
          ))}
          <p className="self-end text-xs text-muted-foreground">
            {result.swings > 0 && t('breakCalc.swings', { count: result.swings })}
          </p>
        </Card>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="border-2 border-success/40 p-5">
            <p className="flex items-center gap-2 text-sm font-bold text-success"><ShieldCheck className="size-5" />{t('breakCalc.safe')}</p>
            <p className="mt-2 text-3xl font-extrabold">{result.safe !== null ? unit(result.safe) : '—'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{result.safe !== null ? t('breakCalc.safeText') : t('breakCalc.noSafe')}</p>
          </Card>
          <Card className="border-2 border-accent p-5">
            <p className="flex items-center gap-2 text-sm font-bold text-navy dark:text-accent"><CircleHelp className="size-5" />{t('breakCalc.edge')}</p>
            <p className="mt-2 text-3xl font-extrabold">{result.edge !== null ? unit(result.edge) : '—'}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.edge !== null ? t('breakCalc.edgeText', { breaking: result.edgeBreak, of: result.edgeTeams }) : t('breakCalc.noEdge')}
            </p>
          </Card>
        </div>

        <Card className="mt-5 overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <p className="font-bold">{t('breakCalc.table')}</p>
            <p className="text-xs text-muted-foreground">{t('breakCalc.tableHint', { rounds })}</p>
          </div>
          <ul className="divide-y divide-border">
            {result.distribution.map(d => (
              <li key={d.score} className="flex items-center gap-3 px-5 py-2 text-sm">
                <span className="w-28 shrink-0 font-semibold tabular-nums">{unit(d.score)}</span>
                <span className="relative h-5 flex-1 overflow-hidden rounded-md bg-muted">
                  <span className={cn('absolute inset-y-0 left-0 rounded-md', d.status === 'safe' ? 'bg-success/70' : d.status === 'edge' ? 'bg-accent' : 'bg-border')}
                    style={{ width: `${(d.teams / maxRow) * 100}%` }} />
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums">{t('breakCalc.teamsN', { count: d.teams })}</span>
                <span className="w-6 shrink-0" aria-label={t(`breakCalc.status.${d.status}`)} title={t(`breakCalc.status.${d.status}`)}>
                  {d.status === 'safe' ? <CheckCircle2 className="size-4 text-success" /> : d.status === 'edge' ? <Trophy className="size-4 text-navy dark:text-accent" /> : <XCircle className="size-4 text-muted-foreground" />}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t('breakCalc.note')}</p>
      </div>
    </div>
  )
}
