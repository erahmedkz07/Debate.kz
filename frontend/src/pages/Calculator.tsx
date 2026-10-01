import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertCircle, BookOpen, CheckCircle2, RotateCcw, Trophy } from 'lucide-react'
import { FORMATS, formatById, type Format } from '@/content/formats'
import { cn, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { BackButton } from '@/components/layout/BackButton'

// Score calculator: enter speaker scores, get team totals, the winner (or the BP ranking with team points)
// and a check of every score against the format's range and step. Nothing is sent anywhere.

type Scores = Record<string, string> // "team:speaker" or "team:reply" -> typed value

const fieldKey = (team: number, slot: number | 'reply') => `${team}:${slot}`

function check(v: string, [min, max]: [number, number], step: number) {
  if (v === '') return 'empty'
  const n = Number(v.replace(',', '.'))
  if (Number.isNaN(n) || n < min || n > max) return 'range'
  if (Math.abs(n / step - Math.round(n / step)) > 1e-9) return 'step'
  return 'ok'
}

export default function Calculator() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const [params, setParams] = useSearchParams()
  const f: Format = formatById(params.get('format') ?? '') ?? FORMATS[0]
  const [scores, setScores] = useState<Scores>({})
  const { speaker, reply, step, teamsPerDebate, speakersPerTeam } = f.score

  const value = (k: string) => Number((scores[k] ?? '').replace(',', '.')) || 0
  const teams = Array.from({ length: teamsPerDebate }, (_, team) => {
    const keys = Array.from({ length: speakersPerTeam }, (_, s) => fieldKey(team, s))
    if (reply) keys.push(fieldKey(team, 'reply'))
    const states = keys.map(k => check(scores[k] ?? '', k.endsWith('reply') ? reply! : speaker, step))
    return { team, name: f.sides[team][lang], keys, total: keys.reduce((s, k) => s + value(k), 0), complete: states.every(x => x === 'ok'), bad: states.some(x => x === 'range' || x === 'step') }
  })
  const complete = teams.every(x => x.complete)
  const ranked = [...teams].sort((a, b) => b.total - a.total)
  const tie = complete && new Set(teams.map(x => x.total)).size < teams.length
  const bpPoints = [3, 2, 1, 0]

  const pick = (id: string) => { setScores({}); setParams({ format: id }, { replace: true }) }
  const hint = (k: string) => (k.endsWith('reply') ? `${reply![0]}–${reply![1]}` : `${speaker[0]}–${speaker[1]}`)

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-4xl">
        <BackButton fallback="/tools" className="-ml-1 mb-2" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">{t('calculator.title')}</h1>
          <Button variant="ghost" size="sm" onClick={() => setScores({})}><RotateCcw className="size-4" />{t('calculator.clear')}</Button>
        </div>
        <p className="mt-1 text-muted-foreground">{t('calculator.subtitle')}</p>
        <Link to="/break-calculator" className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><Trophy className="size-4" />{t('breakCalc.title')}</Link>

        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label={t('timer.format')}>
          {FORMATS.map(x => (
            <button key={x.id} type="button" role="radio" aria-checked={x.id === f.id} onClick={() => pick(x.id)}
              className={cn('cursor-pointer rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors', x.id === f.id ? cn('bg-gradient-to-br text-white shadow-sm', x.accent) : 'bg-muted text-muted-foreground hover:text-foreground')}>
              {x.name[lang]}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t('calculator.ranges', { speaker: `${speaker[0]}–${speaker[1]}`, step: String(step).replace('.', ',') })}
          {reply && ` ${t('calculator.replyRange', { reply: `${reply[0]}–${reply[1]}` })}`}
        </p>

        <div className={cn('mt-6 grid gap-4', teamsPerDebate === 4 ? 'sm:grid-cols-2' : 'md:grid-cols-2')}>
          {teams.map(team => (
            <Card key={team.team} className="overflow-hidden">
              <div className={cn('flex items-center justify-between gap-3 bg-gradient-to-br px-5 py-3 text-white', team.team % 2 ? 'from-navy to-slate-900' : f.accent)}>
                <p className="font-bold">{team.name}</p>
                <p className="text-2xl font-extrabold tabular-nums">{team.total ? formatNumber(team.total) : '—'}</p>
              </div>
              <div className="space-y-2 p-4">
                {team.keys.map((k, i) => {
                  const state = check(scores[k] ?? '', k.endsWith('reply') ? reply! : speaker, step)
                  return (
                    <label key={k} className="flex items-center justify-between gap-3 text-sm">
                      <span className={cn('font-medium', k.endsWith('reply') && 'text-primary')}>{k.endsWith('reply') ? t('calculator.reply') : t('calculator.speaker', { n: i + 1 })}</span>
                      <Input inputMode="decimal" value={scores[k] ?? ''} onChange={e => setScores({ ...scores, [k]: e.target.value.replace(/[^\d.,]/g, '') })}
                        placeholder={hint(k)} aria-invalid={state === 'range' || state === 'step'}
                        className={cn('w-28 text-center tabular-nums', (state === 'range' || state === 'step') && 'border-danger')} />
                    </label>
                  )
                })}
                {team.bad && <p className="flex items-center gap-1.5 text-xs text-danger"><AlertCircle className="size-3.5" />{t('calculator.outOfRange', { step: String(step).replace('.', ',') })}</p>}
              </div>
            </Card>
          ))}
        </div>

        {/* the verdict */}
        <Card className="mt-6 p-5">
          {!complete ? (
            <p className="text-sm text-muted-foreground">{t('calculator.fillAll')}</p>
          ) : tie ? (
            <p className="flex items-start gap-2 text-sm font-semibold text-danger"><AlertCircle className="mt-0.5 size-4 shrink-0" />{t('calculator.tie')}</p>
          ) : teamsPerDebate === 4 ? (
            <ol className="space-y-2">
              {ranked.map((x, i) => (
                <li key={x.team} className="flex items-center gap-3 text-sm">
                  <span className={cn('grid size-8 place-items-center rounded-full font-bold', i === 0 ? 'bg-accent text-navy' : 'bg-muted')}>{i + 1}</span>
                  <span className="flex-1 font-semibold">{x.name}</span>
                  <span className="tabular-nums text-muted-foreground">{formatNumber(x.total)}</span>
                  <span className="w-24 text-right font-bold">{t('calculator.teamPoints', { count: bpPoints[i] })}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
              <Trophy className="size-5 text-accent" />{t('calculator.winner', { team: ranked[0].name })}
              <span className="text-sm font-normal text-muted-foreground">{t('calculator.margin', { margin: formatNumber(ranked[0].total - ranked[1].total) })}</span>
            </p>
          )}
          {complete && !tie && <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />{t(teamsPerDebate === 4 ? 'calculator.noteBp' : 'calculator.note')}</p>}
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to={`/formats?f=${f.id}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"><BookOpen className="size-3.5" />{t('timer.aboutFormat')}</Link>
        </p>
      </div>
    </div>
  )
}
