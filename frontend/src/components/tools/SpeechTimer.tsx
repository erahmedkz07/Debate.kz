import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, BellOff, ChevronLeft, ChevronRight, Maximize, Minimize, Minus, Pause, Play, Plus, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { FORMATS, formatById, poiWindow, type Speech } from '@/content/formats'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FormatPicker } from '@/components/tools/FormatPicker'

// Speech timer for timekeepers, for every format. Runs fully in the browser (works offline once open).
// Speeches with points of information: bells when the POI window opens and closes (protected first and last minute).
// Speeches without POIs: a bell one minute before the end. Everywhere: a double bell at the end, 15 s grace,
// then a triple bell every 5 s. A soft chime marks every full minute (can be switched off), so the speaker hears the
// time go. Preparation counts down from the format's minutes or any number the timekeeper sets.
// Used by the Timer page and, compact, inside the judge's ballot (so the judge never leaves the ballot).
// "Full screen" is the page's own mode (phones have no element full screen): the time big in the middle, and a button
// to leave it; where the browser allows, it also hides the browser's own bars.

const GRACE = 15
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// who speaks: the same colours as on the formats page
const sideLook: Record<Speech['side'], string> = {
  a: 'bg-primary text-primary-foreground', c: 'bg-primary/70 text-primary-foreground',
  b: 'bg-navy text-white', d: 'bg-navy/70 text-white', q: 'bg-accent text-navy',
}

// Bells through Web Audio (no sound files): a struck bell, a fundamental with its overtones and a long soft decay, put
// through a compressor so it is loud on a phone speaker without crackling. "soft" is the quieter minute chime.
type Tone = 'bell' | 'soft'
function useBell(enabled: boolean) {
  const ctx = useRef<{ ac: AudioContext; out: AudioNode } | null>(null)
  // browsers allow sound only after a tap: the Start button calls this first
  const audio = useCallback(() => {
    if (!ctx.current) {
      const ac = new AudioContext()
      const comp = ac.createDynamicsCompressor()
      comp.threshold.value = -18; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.25
      const master = ac.createGain(); master.gain.value = 1.6
      comp.connect(master).connect(ac.destination)
      ctx.current = { ac, out: comp }
    }
    if (ctx.current.ac.state === 'suspended') void ctx.current.ac.resume()
    return ctx.current
  }, [])
  const ring = useCallback((times: number, tone: Tone = 'bell') => {
    if (enabled) {
      const { ac, out } = audio()
      // partials of a bell: the note, its octave, a fifth above that, and a high shimmer
      const partials = tone === 'bell' ? [[784, 1], [1568, 0.5], [2352, 0.28], [3136, 0.12]] : [[1046, 0.7], [2092, 0.18]]
      const peak = tone === 'bell' ? 0.9 : 0.35, decay = tone === 'bell' ? 1.1 : 0.45, gap = tone === 'bell' ? 0.42 : 0.3
      for (let i = 0; i < times; i++) {
        const at = ac.currentTime + 0.01 + i * gap
        for (const [freq, level] of partials) {
          const osc = ac.createOscillator(), gain = ac.createGain()
          osc.type = 'sine'; osc.frequency.value = freq
          gain.gain.setValueAtTime(0.0001, at)
          gain.gain.exponentialRampToValueAtTime(peak * level, at + 0.008)
          gain.gain.exponentialRampToValueAtTime(0.0001, at + decay)
          osc.connect(gain).connect(out)
          osc.start(at); osc.stop(at + decay + 0.05)
        }
      }
    }
    if (tone === 'bell') navigator.vibrate?.(Array.from({ length: times * 2 - 1 }, (_, i) => (i % 2 ? 120 : 250)))
  }, [enabled, audio])
  return { ring, unlock: audio }
}

const PREP_MAX = 60

interface Props {
  formatId?: string
  onFormatChange?: (id: string) => void // shows the format picker when given
  active?: boolean // keyboard shortcuts only while the timer is on screen
  compact?: boolean
}

export function SpeechTimer({ formatId, onFormatChange, active = true, compact }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const format = formatById(formatId ?? '') ?? FORMATS[0]
  const [mode, setMode] = useState<'debate' | 'prep'>('debate')
  const [prep, setPrep] = useState(format.prepMinutes[0])
  const [index, setIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [sound, setSound] = useState(true)
  const [minuteChime, setMinuteChime] = useState(true)
  const [big, setBig] = useState(false)
  const startedAt = useRef<number | null>(null)
  const base = useRef(0)
  const rung = useRef(new Set<string>())
  const { ring: bell, unlock } = useBell(sound)
  const cardRef = useRef<HTMLDivElement>(null)

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
    const ring = (id: string, times: number, tone?: Tone) => { if (!rung.current.has(id)) { rung.current.add(id); bell(times, tone) } }
    for (const b of bells) if (b > 0 && elapsed >= b) ring(`b${b}`, 1)
    if (elapsed >= length) ring('end', 2)
    if (mode !== 'prep' && elapsed >= length + GRACE) ring(`over${Math.floor((elapsed - length - GRACE) / 5)}`, 3)
    // a soft chime at every full minute before the end, unless a rule bell rings at that moment
    const minute = Math.floor(elapsed / 60) * 60
    if (minuteChime && running && minute > 0 && minute < length && !bells.includes(minute) && elapsed - minute < 2) ring(`m${minute}`, 1, 'soft')
    // preparation simply ends at zero
    if (mode === 'prep' && elapsed >= length) setRunning(false)
  }, [elapsed, bells, length, mode, bell, minuteChime, running]) // eslint-disable-line react-hooks/exhaustive-deps -- runs on every tick anyway

  // keep the phone screen on while the timer runs
  useEffect(() => {
    if (!running || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | undefined
    navigator.wakeLock.request('screen').then(l => { lock = l }).catch(() => undefined)
    return () => { void lock?.release() }
  }, [running])

  // the page's own full screen; the browser's too where it exists. Leaving the browser's (Esc) leaves ours as well.
  const enterBig = () => { setBig(true); void cardRef.current?.requestFullscreen?.().catch(() => undefined) }
  const leaveBig = () => { setBig(false); if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined) }
  useEffect(() => {
    const sync = () => { if (!document.fullscreenElement) setBig(false) }
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  useEffect(() => {
    if (!big) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBig(false) }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [big])

  const reset = useCallback(() => { setRunning(false); base.current = 0; setElapsed(0); rung.current = new Set() }, [])
  const setPrepMinutes = (m: number) => { reset(); setPrep(Math.max(1, Math.min(PREP_MAX, Math.round(m) || 1))) }
  const toggle = () => { unlock(); setRunning(v => !v) }
  const go = (to: number) => { reset(); setIndex(Math.max(0, Math.min(format.speeches.length - 1, to))) }
  const pickFormat = (id: string) => {
    const f = formatById(id)!
    reset(); setIndex(0); setPrep(f.prepMinutes[0])
    onFormatChange?.(id)
  }

  // space starts/pauses, arrows switch speakers (not while typing, and only while the timer is shown)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select, button')) return
      if (e.code === 'Space') { e.preventDefault(); toggle() }
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
  const left = Math.max(0, length - elapsed)
  const rule = mode === 'prep' ? t('timer.rulePrep', { count: prep })
    : poi ? t('timer.rulePoi', { from: fmt(poi[0]), to: fmt(poi[1]), end: fmt(length) })
      : speech.side === 'q' ? t('timer.ruleCross', { end: fmt(length) }) : t('timer.ruleNoPoi', { end: fmt(length) })

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-2xl bg-muted p-1">
          {(['debate', 'prep'] as const).map(m => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => { reset(); setMode(m) }}
              className={cn('cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold', mode === m ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground')}>
              {t(`timer.mode.${m}`)}
            </button>
          ))}
        </div>
        {compact && <span className={cn('rounded-xl bg-gradient-to-br px-3 py-1.5 text-xs font-bold text-white', format.accent)}>{format.name[lang]}</span>}
      </div>

      {/* the format: its own colours, speech order and POI rules */}
      {onFormatChange && (
        <FormatPicker className="mt-4" value={format.id} onChange={pickFormat} />
      )}

      <Card ref={cardRef} className={cn('overflow-hidden text-center', big ? 'fixed inset-0 z-[100] flex flex-col rounded-none border-0' : 'mt-4')}>
        <div className={cn('bg-gradient-to-br px-6 py-3 text-sm font-semibold text-white', mode === 'prep' ? 'from-slate-600 to-slate-800' : format.accent, big && 'py-4 text-base sm:text-lg')}>
          {mode === 'prep' ? t('timer.prepFor', { format: format.short, count: prep }) : `${index + 1}/${format.speeches.length} · ${speech.role[lang]}`}
        </div>
        {/* full screen: the time in the middle of the screen, the controls under it */}
        <div className={cn(big ? 'flex flex-1 flex-col justify-center overflow-y-auto px-5 py-8 sm:px-12' : compact ? 'p-5' : 'p-6 sm:p-10')}>
          <p className={cn('font-mono font-extrabold leading-none tabular-nums', big ? 'text-[clamp(5rem,22vw,18rem)]' : compact ? 'text-6xl' : 'text-7xl sm:text-9xl', color)} aria-live="off">{fmt(shown)}</p>
          <p className={cn('mt-3 font-bold', big ? 'text-xl sm:text-3xl' : 'text-lg', color)} role="status">{t(`timer.phase.${phase}`)}</p>
          {mode === 'debate' && !over && <p className={cn('mt-1 tabular-nums text-muted-foreground', big ? 'text-base sm:text-xl' : 'text-sm')}>{t('timer.left', { time: fmt(left) })}</p>}

          {/* progress with the POI window shaded */}
          <div className={cn('relative mt-6 h-3 overflow-hidden rounded-full bg-muted', big && 'mx-auto w-full max-w-5xl')}>
            {poi && <div className="absolute inset-y-0 bg-success/20" style={{ left: `${(poi[0] / length) * 100}%`, width: `${((poi[1] - poi[0]) / length) * 100}%` }} />}
            <div className={cn('absolute inset-y-0 left-0 rounded-full transition-[width]', over ? 'bg-danger' : 'bg-primary')} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{rule}</p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {mode === 'debate' && <Button variant="outline" size="icon" disabled={index === 0} onClick={() => go(index - 1)} aria-label={t('timer.prev')}><ChevronLeft className="size-5" /></Button>}
            <Button size="lg" className="min-w-40" onClick={toggle}>
              {running ? <><Pause className="size-5" />{t('timer.pause')}</> : <><Play className="size-5" />{elapsed ? t('timer.resume') : t('timer.start')}</>}
            </Button>
            <Button variant="outline" size="icon" onClick={reset} aria-label={t('timer.reset')} title={t('timer.reset')}><RotateCcw className="size-5" /></Button>
            {mode === 'debate' && <Button variant="outline" size="icon" disabled={index === format.speeches.length - 1} onClick={() => go(index + 1)} aria-label={t('timer.next')}><ChevronRight className="size-5" /></Button>}
          </div>

          {/* preparation: the format's minutes, or any number from 1 to 60 */}
          {mode === 'prep' && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {format.prepMinutes.map(m => (
                <Button key={m} size="sm" variant={prep === m ? 'primary' : 'outline'} onClick={() => setPrepMinutes(m)}>{t('timer.minutes', { count: m })}</Button>
              ))}
              <div className="flex items-center gap-1 rounded-xl border-2 border-border p-0.5" role="group" aria-label={t('timer.prepCustom')}>
                <Button size="icon" variant="ghost" className="size-8" disabled={prep <= 1} onClick={() => setPrepMinutes(prep - 1)} aria-label={t('timer.prepLess')}><Minus className="size-4" /></Button>
                <input type="number" inputMode="numeric" min={1} max={PREP_MAX} value={prep} onChange={e => setPrepMinutes(Number(e.target.value))}
                  aria-label={t('timer.prepCustom')} className="w-12 bg-transparent text-center text-sm font-bold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                <Button size="icon" variant="ghost" className="size-8" disabled={prep >= PREP_MAX} onClick={() => setPrepMinutes(prep + 1)} aria-label={t('timer.prepMore')}><Plus className="size-4" /></Button>
                <span className="pr-2 text-xs text-muted-foreground">{t('timer.min')}</span>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSound(v => !v)} aria-pressed={sound}>
              {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}{sound ? t('timer.soundOn') : t('timer.soundOff')}
            </Button>
            {sound && <Button variant="ghost" size="sm" onClick={() => bell(1)}>{t('timer.testSound')}</Button>}
            <Button variant="ghost" size="sm" onClick={() => setMinuteChime(v => !v)} aria-pressed={minuteChime} disabled={!sound}>
              {minuteChime ? <Bell className="size-4" /> : <BellOff className="size-4" />}{t(minuteChime ? 'timer.minuteChimeOn' : 'timer.minuteChimeOff')}
            </Button>
            {big
              ? <Button variant="outline" size="sm" onClick={leaveBig}><Minimize className="size-4" />{t('timer.exitFullscreen')}</Button>
              : <Button variant="ghost" size="sm" onClick={enterBig}><Maximize className="size-4" />{t('timer.fullscreen')}</Button>}
          </div>
        </div>
      </Card>

      {mode === 'debate' && (
        <ol className={cn('mt-6 grid grid-cols-1 gap-2', !compact && 'sm:grid-cols-2')}>
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
    </div>
  )
}
