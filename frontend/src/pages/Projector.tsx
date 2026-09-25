import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowLeft, Eye, LayoutList, Maximize, Megaphone, Pause, Play, Presentation } from 'lucide-react'
import { getTournamentById, updateRound } from '@/api'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/brand'
import { Select } from '@/components/ui/select'

// Projector mode for the venue screen: the motion appears for everyone at the same moment,
// then the preparation countdown runs; the draw can be shown in large type.
// Public viewers see only released motions; organizers can reveal and release a draft round from here.

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function Projector() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const { data, error, reload } = useAsync(() => getTournamentById(id), [id])
  const [view, setView] = useState<'cover' | 'motion' | 'draw'>('cover')
  const [prep, setPrep] = useState(60)
  const [left, setLeft] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const endsAt = useRef(0)

  const rounds = data?.rounds ?? []
  const round = rounds.find(r => r.id === params.get('round')) ?? rounds.find(r => r.status === 'released') ?? rounds.find(r => r.status === 'draft') ?? rounds[0]
  const manager = !!data?.myRole
  const debates = data?.debates.filter(d => d.roundId === round?.id) ?? []
  const team = (tid: string) => data?.teams.find(x => x.id === tid)?.name ?? '—'
  const judge = (jid?: string) => data?.judges.find(j => j.id === jid)?.name ?? '—'

  // preparation countdown, from a fixed end time so it never drifts
  useEffect(() => {
    if (!running) return
    const tick = () => {
      const s = Math.max(0, (endsAt.current - Date.now()) / 1000)
      setLeft(s)
      if (s === 0) setRunning(false)
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [running])
  const startPrep = () => { endsAt.current = Date.now() + (left ?? prep * 60) * 1000; setRunning(true) }
  const pausePrep = () => { setRunning(false) }

  const reveal = () => { setView('motion'); if (left === null) { setLeft(prep * 60); endsAt.current = Date.now() + prep * 60 * 1000; setRunning(true) } }
  const release = async () => {
    if (!round) return
    try {
      await updateRound(round.id, { status: 'released' })
      toast.success(t('projector.released'))
      reload()
      reveal()
    } catch (e) {
      toast.error(errorMessage(e, t))
    }
  }

  // keys: M motion, D draw, C cover, space pauses the countdown, F fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('button, [role=combobox]')) return
      if (e.key === 'm' || e.key === 'ь') reveal()
      if (e.key === 'd' || e.key === 'в') setView('draw')
      if (e.key === 'c' || e.key === 'с') setView('cover')
      if (e.key === 'f' || e.key === 'а') void document.documentElement.requestFullscreen?.()
      if (e.code === 'Space' && left !== null) { e.preventDefault(); if (running) pausePrep(); else startPrep() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (error) return <div className="grid min-h-dvh place-items-center bg-navy text-white">{t('projector.notFound')}</div>
  if (!data || !round) return <div className="min-h-dvh bg-navy" />
  // the motion of a draft round is visible only to organizers
  const motionKnown = !!round.motion && (round.status !== 'draft' || manager)

  return (
    <div className="flex min-h-dvh flex-col bg-navy text-white">
      <header className="flex flex-wrap items-center justify-between gap-4 px-8 py-6">
        <div className="flex items-center gap-4">
          <Logo inverted />
          <div>
            <p className="text-lg font-bold">{data.name}</p>
            <p className="text-sm text-white/60">{round.name}</p>
          </div>
        </div>
        {left !== null && view !== 'draw' && (
          <div className={cn('rounded-2xl px-6 py-3 text-right', left === 0 ? 'bg-danger' : 'bg-white/10')}>
            <p className="text-xs uppercase tracking-wider text-white/60">{left === 0 ? t('projector.prepOver') : t('projector.prepLeft')}</p>
            <p className="font-mono text-5xl font-extrabold tabular-nums">{fmt(left)}</p>
          </div>
        )}
      </header>

      <main className="flex flex-1 items-center justify-center px-8 pb-8">
        {view === 'cover' && (
          <div className="text-center">
            <Presentation className="mx-auto size-16 text-accent" />
            <p className="mt-6 text-4xl font-extrabold sm:text-6xl">{round.name}</p>
            <p className="mt-4 text-xl text-white/70 sm:text-2xl">{t('projector.soon')}</p>
          </div>
        )}
        {view === 'motion' && (
          <div className="max-w-6xl text-center">
            {motionKnown ? (
              <>
                {round.infoSlide && (
                  <div className="mx-auto mb-10 max-w-4xl rounded-3xl bg-white/10 p-6 text-left text-xl leading-relaxed sm:text-2xl">
                    <p className="mb-2 text-sm font-bold uppercase tracking-wider text-accent">{t('projector.infoSlide')}</p>
                    <p className="whitespace-pre-line">{round.infoSlide}</p>
                  </div>
                )}
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-accent">{t('projector.motion')}</p>
                <p className="mt-6 text-4xl font-extrabold leading-tight sm:text-6xl lg:text-7xl">«{round.motion}»</p>
              </>
            ) : <p className="text-3xl text-white/70">{t('projector.notReleased')}</p>}
          </div>
        )}
        {view === 'draw' && (
          <div className="w-full max-w-6xl">
            {debates.length === 0 || (round.status === 'draft' && !manager) ? <p className="text-center text-3xl text-white/70">{t('projector.noDraw')}</p> : (
              <table className="w-full text-left text-xl sm:text-2xl">
                <thead className="text-sm uppercase tracking-wider text-white/50">
                  <tr><th className="py-3 pr-4">{t('tournament.room')}</th><th className="py-3 pr-4">{t('tournament.proposition')}</th><th className="py-3 pr-4">{t('tournament.opposition')}</th><th className="py-3">{t('tournament.chair')}</th></tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {debates.map(d => (
                    <tr key={d.id}>
                      <td className="py-4 pr-4 font-bold text-accent">{d.room}</td>
                      <td className="py-4 pr-4 font-semibold">{team(d.propositionTeamId)}</td>
                      <td className="py-4 pr-4 font-semibold">{team(d.oppositionTeamId)}</td>
                      <td className="py-4 text-white/70">{judge(d.judgeIds[0])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>

      {/* controls stay dim so the audience looks at the content */}
      <footer className="flex flex-wrap items-center justify-center gap-2 px-6 pb-6 opacity-40 transition-opacity hover:opacity-100 focus-within:opacity-100">
        <Link to={manager ? `/dashboard/tournaments/${id}/rounds` : `/tournaments/${id}`} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm hover:bg-white/10"><ArrowLeft className="size-4" />{t('projector.exit')}</Link>
        <Select size="sm" className="w-40 text-foreground" value={round.id} onValueChange={v => { setParams({ round: v }, { replace: true }); setView('cover'); setLeft(null); setRunning(false) }}
          aria-label={t('dashboard.draw.round')} options={rounds.map(r => ({ value: r.id, label: r.name, hint: t(`tournament.roundStatus.${r.status}`) }))} />
        <Ctl onClick={() => setView('cover')} active={view === 'cover'}><Presentation className="size-4" />{t('projector.cover')}</Ctl>
        <Ctl onClick={reveal} active={view === 'motion'}><Eye className="size-4" />{t('projector.showMotion')}</Ctl>
        <Ctl onClick={() => setView('draw')} active={view === 'draw'}><LayoutList className="size-4" />{t('projector.showDraw')}</Ctl>
        {manager && round.status === 'draft' && <Ctl onClick={release}><Megaphone className="size-4" />{t('projector.release')}</Ctl>}
        {left !== null && (running
          ? <Ctl onClick={pausePrep}><Pause className="size-4" />{t('timer.pause')}</Ctl>
          : <Ctl onClick={startPrep}><Play className="size-4" />{t('timer.resume')}</Ctl>)}
        {left === null && [30, 60].map(m => <Ctl key={m} onClick={() => setPrep(m)} active={prep === m}>{t('timer.minutes', { count: m })}</Ctl>)}
        <Ctl onClick={() => void document.documentElement.requestFullscreen?.()}><Maximize className="size-4" />{t('timer.fullscreen')}</Ctl>
      </footer>
    </div>
  )
}

function Ctl({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold', active ? 'bg-white text-navy' : 'hover:bg-white/10')}>
      {children}
    </button>
  )
}
