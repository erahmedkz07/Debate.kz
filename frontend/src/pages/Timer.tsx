import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Maximize, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// WSDC speech timer for timekeepers. Runs fully in the browser (works offline once the page is open).
// Substantive: 8:00, first and last minute protected (bells at 1:00 and 7:00), double bell at 8:00,
// 15 s grace, then a continuous bell. Reply: 4:00, no POIs, bell at 3:00, double at 4:00.

type Kind = 'substantive' | 'reply' | 'prep'
interface Slot { key: string; side?: 'proposition' | 'opposition'; kind: Kind }

const WSDC: Slot[] = [
  { key: 'p1', side: 'proposition', kind: 'substantive' },
  { key: 'o1', side: 'opposition', kind: 'substantive' },
  { key: 'p2', side: 'proposition', kind: 'substantive' },
  { key: 'o2', side: 'opposition', kind: 'substantive' },
  { key: 'p3', side: 'proposition', kind: 'substantive' },
  { key: 'o3', side: 'opposition', kind: 'substantive' },
  { key: 'oReply', side: 'opposition', kind: 'reply' },
  { key: 'pReply', side: 'proposition', kind: 'reply' },
]
const GRACE = 15
const rules = (kind: Kind, prep: number) =>
  kind === 'substantive' ? { length: 480, bells: [60, 420], poi: [60, 420] as [number, number] }
    : kind === 'reply' ? { length: 240, bells: [180], poi: null }
      : { length: prep * 60, bells: [prep * 60 - 300], poi: null } // prep: a warning 5 minutes before the end

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

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
  const { t } = useTranslation()
  const [mode, setMode] = useState<'debate' | 'prep'>('debate')
  const [prep, setPrep] = useState(60)
  const [index, setIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [sound, setSound] = useState(true)
  const startedAt = useRef<number | null>(null)
  const base = useRef(0)
  const rung = useRef(new Set<string>())
  const bell = useBell(sound)
  const slot: Slot = mode === 'prep' ? { key: 'prep', kind: 'prep' } : WSDC[index]
  const r = rules(slot.kind, prep)

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
    for (const b of r.bells) if (b > 0 && elapsed >= b) ring(`b${b}`, 1)
    if (elapsed >= r.length) ring('end', 2)
    if (slot.kind !== 'prep' && elapsed >= r.length + GRACE) ring(`over${Math.floor((elapsed - r.length - GRACE) / 5)}`, 3)
    // preparation simply ends at zero
    if (slot.kind === 'prep' && elapsed >= r.length) setRunning(false)
  }, [elapsed, r, slot.kind, bell])

  // keep the phone screen on while the timer runs
  useEffect(() => {
    if (!running || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | undefined
    navigator.wakeLock.request('screen').then(l => { lock = l }).catch(() => undefined)
    return () => { void lock?.release() }
  }, [running])

  const reset = useCallback(() => { setRunning(false); base.current = 0; setElapsed(0); rung.current = new Set() }, [])
  const go = (to: number) => { reset(); setIndex(Math.max(0, Math.min(WSDC.length - 1, to))) }

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

  const over = elapsed >= r.length
  const phase = over ? (slot.kind !== 'prep' && elapsed >= r.length + GRACE ? 'overtime' : 'grace')
    : r.poi ? (elapsed >= r.poi[0] && elapsed < r.poi[1] ? 'poi' : 'protected') : 'running'
  const color = { protected: 'text-foreground', poi: 'text-success', running: 'text-foreground', grace: 'text-accent-foreground dark:text-accent', overtime: 'text-danger' }[phase]
  const pct = Math.min(100, (elapsed / r.length) * 100)
  const shown = slot.kind === 'prep' ? Math.max(0, r.length - elapsed) : elapsed // prep counts down, speeches count up

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-3xl">
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

        <Card className="mt-6 p-6 text-center sm:p-10" id="timer-card">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {mode === 'prep' ? t('timer.prep', { count: prep }) : `${t(`timer.speech.${slot.key}`)} · ${t(`timer.kind.${slot.kind}`)}`}
          </p>
          <p className={cn('mt-4 font-mono text-7xl font-extrabold tabular-nums sm:text-9xl', color)} aria-live="off">{fmt(shown)}</p>
          <p className={cn('mt-3 text-lg font-bold', color)} role="status">{t(`timer.phase.${phase}`)}</p>

          {/* progress with the POI window shaded */}
          <div className="relative mt-6 h-3 overflow-hidden rounded-full bg-muted">
            {r.poi && <div className="absolute inset-y-0 bg-success/20" style={{ left: `${(r.poi[0] / r.length) * 100}%`, width: `${((r.poi[1] - r.poi[0]) / r.length) * 100}%` }} />}
            <div className={cn('absolute inset-y-0 left-0 rounded-full transition-[width]', over ? 'bg-danger' : 'bg-primary')} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t(`timer.rules.${slot.kind}`, { count: prep })}</p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {mode === 'debate' && <Button variant="outline" size="icon" disabled={index === 0} onClick={() => go(index - 1)} aria-label={t('timer.prev')}><ChevronLeft className="size-5" /></Button>}
            <Button size="lg" className="min-w-40" onClick={() => setRunning(v => !v)}>
              {running ? <><Pause className="size-5" />{t('timer.pause')}</> : <><Play className="size-5" />{elapsed ? t('timer.resume') : t('timer.start')}</>}
            </Button>
            <Button variant="outline" size="icon" onClick={reset} aria-label={t('timer.reset')} title={t('timer.reset')}><RotateCcw className="size-5" /></Button>
            {mode === 'debate' && <Button variant="outline" size="icon" disabled={index === WSDC.length - 1} onClick={() => go(index + 1)} aria-label={t('timer.next')}><ChevronRight className="size-5" /></Button>}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSound(v => !v)} aria-pressed={sound}>
              {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}{sound ? t('timer.soundOn') : t('timer.soundOff')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => document.getElementById('timer-card')?.requestFullscreen?.()}><Maximize className="size-4" />{t('timer.fullscreen')}</Button>
            {mode === 'prep' && [30, 60].map(m => (
              <Button key={m} size="sm" variant={prep === m ? 'primary' : 'outline'} onClick={() => { reset(); setPrep(m) }}>{t('timer.minutes', { count: m })}</Button>
            ))}
          </div>
        </Card>

        {mode === 'debate' && (
          <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {WSDC.map((s, i) => (
              <li key={s.key}>
                <button type="button" onClick={() => go(i)} aria-current={i === index}
                  className={cn('w-full cursor-pointer rounded-xl border-2 px-3 py-2 text-left text-sm transition-colors',
                    i === index ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/40', i < index && 'opacity-60')}>
                  <span className="block text-xs text-muted-foreground">{i + 1}. {t(`timer.kind.${s.kind}`)}</span>
                  <span className="font-semibold">{t(`timer.speech.${s.key}`)}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-6 text-center text-xs text-muted-foreground">{t('timer.keys')}</p>
      </div>
    </div>
  )
}
