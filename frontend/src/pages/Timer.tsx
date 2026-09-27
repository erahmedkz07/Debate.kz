import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookOpen, ChevronLeft, ChevronRight, Maximize, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { FORMATS, formatById, poiWindow, type Speech } from '@/content/formats'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { BackButton } from '@/components/layout/BackButton'

// Speech timer for timekeepers, for WSDC, BP, APF and Karl Popper. Runs fully in the browser (works offline once open).
// Speeches with points of information: bells when the POI window opens and closes (protected first and last minute).
// Speeches without POIs: a bell one minute before the end. Everywhere: a double bell at the end, 15 s grace,
// then a triple bell every 5 s. Preparation counts down with a warning 5 minutes (or 1 minute) before the end.

const GRACE = 15
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// who speaks: the same colours as on the formats page
const sideLook: Record<Speech['side'], string> = {
  a: 'bg-primary text-primary-foreground', c: 'bg-primary/70 text-primary-foreground',
  b: 'bg-navy text-white', d: 'bg-navy/70 text-white', q: 'bg-accent text-navy',
}

// short beeps through Web Audio (no sound files needed)
function useBell(enabled: boolean) {
  const ctx = useRef<AudioContext | null>(null)
  return useCallback((times: number) => {
    if (enabled) {
      ctx.current ??= new AudioContext()
      const ac = ctx.current
      for (let i = 0; i < times; i++) {
        const osc = ac.createOscillator(), gain = ac.createGain()
        osc.type = 'sine'; osc.frequency.value = 880
        const at = ac.currentTime + i * 0.35
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(0.6, at + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3)
        osc.connect(gain).connect(ac.destination)
        osc.start(at); osc.stop(at + 0.32)
      }
    }
    navigator.vibrate?.(Array.from({ length: times * 2 - 1 }, (_, i) => (i % 2 ? 120 : 250)))
  }, [enabled])
}

export default function Timer() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const [params, setParams] = useSearchParams()
  const format = formatById(params.get('format') ?? '') ?? FORMATS[0]
  const [mode, setMode] = useState<'debate' | 'prep'>('debate')
  const [prep, setPrep] = useState(format.prepMinutes[0])
  const [index, setIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [sound, setSound] = useState(true)
  const startedAt = useRef<number | null>(null)
  const base = useRef(0)
  const rung = useRef(new Set<string>())
  const bell = useBell(sound)

  const speech = format.speeches[Math.min(index, format.speeches.length - 1)]
  const length = mode === 'prep' ? prep * 60 : speech.minutes * 60
  const poi = mode === 'prep' ? null : poiWindow(format, speech)
  // the warning bell: POI window marks, or one minute before the end (preparation: 5 min, or 1 min for short prep)
  const bells = poi ? [poi[0], poi[1]] : [length - (mode === 'prep' ? (prep > 10 ? 300 : 60) : 60)]

  // time from Date.now(), so the display never drifts even if the tab is throttled
  useEffect(() => {
    if (!running) return
    startedAt.current = Date.now()
    const id = setInterval(() => setElapsed(base.current + (Date.now() - startedAt.current!) / 1000), 200)
    return () => { clearInterval(id); base.current += (Date.now() - startedAt.current!) / 1000 }
  }, [running])

  // bells: once per mark; after the grace period a bell every 5 s
  useEffect(() => {
    const ring = (id: string, times: number) => { if (!rung.current.has(id)) { rung.current.add(id); bell(times) } }
    for (const b of bells) if (b > 0 && elapsed >= b) ring(`b${b}`, 1)
    if (elapsed >= length) ring('end', 2)
    if (mode !== 'prep' && elapsed >= length + GRACE) ring(`over${Math.floor((elapsed - length - GRACE) / 5)}`, 3)
    // preparation simply ends at zero
    if (mode === 'prep' && elapsed >= length) setRunning(false)
  }, [elapsed, bells, length, mode, bell])

  // keep the phone screen on while the timer runs
  useEffect(() => {
    if (!running || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | undefined
    navigator.wakeLock.request('screen').then(l => { lock = l }).catch(() => undefined)
    return () => { void lock?.release() }
  }, [running])

  const reset = useCallback(() => { setRunning(false); base.current = 0; setElapsed(0); rung.current = new Set() }, [])
  const go = (to: number) => { reset(); setIndex(Math.max(0, Math.min(format.speeches.length - 1, to))) }
  const pickFormat = (id: string) => {
    const f = formatById(id)!
    reset(); setIndex(0); setPrep(f.prepMinutes[0])
    setParams({ format: id }, { replace: true })
  }

  // space starts/pauses, arrows switch speakers
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select, button')) return
      if (e.code === 'Space') { e.preventDefault(); setRunning(v => !v) }
      if (e.code === 'ArrowRight' && mode === 'debate') go(index + 1)
      if (e.code === 'ArrowLeft' && mode === 'debate') go(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const over = elapsed >= length
  const phase = over ? (mode !== 'prep' && elapsed >= length + GRACE ? 'overtime' : 'grace')
    : poi ? (elapsed >= poi[0] && elapsed < poi[1] ? 'poi' : 'protected') : 'running'
  const color = { protected: 'text-foreground', poi: 'text-success', running: 'text-foreground', grace: 'text-accent-foreground dark:text-accent', overtime: 'text-danger' }[phase]
  const pct = Math.min(100, (elapsed / length) * 100)
  const shown = mode === 'prep' ? Math.max(0, length - elapsed) : elapsed // prep counts down, speeches count up
  const rule = mode === 'prep' ? t('timer.rulePrep', { count: prep })
    : poi ? t('timer.rulePoi', { from: fmt(poi[0]), to: fmt(poi[1]), end: fmt(length) })
      : speech.side === 'q' ? t('timer.ruleCross', { end: fmt(length) }) : t('timer.ruleNoPoi', { end: fmt(length) })

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-3xl">
        <BackButton fallback="/tools" className="-ml-1 mb-2" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">{t('timer.title')}</h1>
          <div className="flex gap-1 rounded-2xl bg-muted p-1">
            {(['debate', 'prep'] as const).map(m => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => { reset(); setMode(m) }}
                className={cn('cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold', mode === m ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground')}>
                {t(`timer.mode.${m}`)}
              </button>
            ))}
          </div>
        </div>

        {/* the format: its own colours, speech order and POI rules */}
        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label={t('timer.format')}>
          {FORMATS.map(f => (
            <button key={f.id} type="button" role="radio" aria-checked={f.id === format.id} onClick={() => pickFormat(f.id)}
              className={cn('cursor-pointer rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors', f.id === format.id ? cn('bg-gradient-to-br text-white shadow-sm', f.accent) : 'bg-muted text-muted-foreground hover:text-foreground')}>
              {f.name[lang]}
            </button>
          ))}
        </div>

        <Card className="mt-4 overflow-hidden text-center" id="timer-card">
          <div className={cn('bg-gradient-to-br px-6 py-3 text-sm font-semibold text-white', mode === 'prep' ? 'from-slate-600 to-slate-800' : format.accent)}>
            {mode === 'prep' ? t('timer.prepFor', { format: format.short, count: prep }) : `${index + 1}/${format.speeches.length} · ${speech.role[lang]}`}
          </div>
          <div className="p-6 sm:p-10">
            <p className={cn('font-mono text-7xl font-extrabold tabular-nums sm:text-9xl', color)} aria-live="off">{fmt(shown)}</p>
            <p className={cn('mt-3 text-lg font-bold', color)} role="status">{t(`timer.phase.${phase}`)}</p>

            {/* progress with the POI window shaded */}
            <div className="relative mt-6 h-3 overflow-hidden rounded-full bg-muted">
              {poi && <div className="absolute inset-y-0 bg-success/20" style={{ left: `${(poi[0] / length) * 100}%`, width: `${((poi[1] - poi[0]) / length) * 100}%` }} />}
              <div className={cn('absolute inset-y-0 left-0 rounded-full transition-[width]', over ? 'bg-danger' : 'bg-primary')} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{rule}</p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {mode === 'debate' && <Button variant="outline" size="icon" disabled={index === 0} onClick={() => go(index - 1)} aria-label={t('timer.prev')}><ChevronLeft className="size-5" /></Button>}
              <Button size="lg" className="min-w-40" onClick={() => setRunning(v => !v)}>
                {running ? <><Pause className="size-5" />{t('timer.pause')}</> : <><Play className="size-5" />{elapsed ? t('timer.resume') : t('timer.start')}</>}
              </Button>
              <Button variant="outline" size="icon" onClick={reset} aria-label={t('timer.reset')} title={t('timer.reset')}><RotateCcw className="size-5" /></Button>
              {mode === 'debate' && <Button variant="outline" size="icon" disabled={index === format.speeches.length - 1} onClick={() => go(index + 1)} aria-label={t('timer.next')}><ChevronRight className="size-5" /></Button>}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSound(v => !v)} aria-pressed={sound}>
                {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}{sound ? t('timer.soundOn') : t('timer.soundOff')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => document.getElementById('timer-card')?.requestFullscreen?.()}><Maximize className="size-4" />{t('timer.fullscreen')}</Button>
              {mode === 'prep' && format.prepMinutes.map(m => (
                <Button key={m} size="sm" variant={prep === m ? 'primary' : 'outline'} onClick={() => { reset(); setPrep(m) }}>{t('timer.minutes', { count: m })}</Button>
              ))}
            </div>
          </div>
        </Card>

        {mode === 'debate' && (
          <ol className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {format.speeches.map((s, i) => (
              <li key={i}>
                <button type="button" onClick={() => go(i)} aria-current={i === index}
                  className={cn('flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 p-2 text-left text-sm transition-colors',
                    i === index ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/40', i < index && 'opacity-60')}>
                  <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold', sideLook[s.side])}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{s.role[lang]}</span>
                  <span className="shrink-0 pr-1 text-xs tabular-nums text-muted-foreground">{t('formats.min', { n: s.minutes })}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t('timer.keys')} · <Link to={`/formats?f=${format.id}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"><BookOpen className="size-3.5" />{t('timer.aboutFormat')}</Link>
        </p>
      </div>
    </div>
  )
}
