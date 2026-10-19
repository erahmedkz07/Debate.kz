import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, CloudOff, Loader2, NotebookPen, Plus, X } from 'lucide-react'
import type { FlowEntry, FlowNotes, FlowTag } from '@/api'
import { formatOfTournament } from '@/content/formats'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

// The judge's flow: notes speech by speech, in the order of the format's speeches (WSDC: 1st Proposition, 1st
// Opposition… then the replies; BP: the eight speeches of four teams). A note carries a tag — argument, fact or
// example, rebuttal, POI, weak point, note — so the clash of each line stays visible. Saved as the judge writes
// (on this device at once, on the server a moment later): a dropped connection or a closed tab loses nothing.

export const FLOW_TAGS: FlowTag[] = ['arg', 'fact', 'rebut', 'poi', 'weak', 'note']
const TAG_LOOK: Record<FlowTag, string> = {
  arg: 'bg-primary-soft text-primary',
  fact: 'bg-success-soft text-success',
  rebut: 'bg-danger-soft text-danger',
  poi: 'bg-accent-soft text-navy dark:text-accent',
  weak: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
  note: 'bg-muted text-muted-foreground',
}
const SIDE_LOOK: Record<string, string> = { a: 'border-t-primary', b: 'border-t-navy dark:border-t-accent', c: 'border-t-violet-500', d: 'border-t-orange-500', q: 'border-t-border' }

export function FlowTagBadge({ tag }: { tag: FlowTag }) {
  const { t } = useTranslation()
  return <span className={cn('inline-block shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', TAG_LOOK[tag])}>{t(`flow.tags.${tag}`)}</span>
}

const keyOf = (debateId: string, uid: string) => `flow:${debateId}:${uid}`

export function FlowSheet({ formatCode, initial, debateId, uid, onSave }: {
  formatCode: string; initial?: FlowNotes; debateId: string; uid: string; onSave: (flow: FlowNotes) => Promise<unknown>
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const speeches = formatOfTournament(formatCode).speeches
  // the newest copy wins: this device's (written offline) or the server's
  const [flow, setFlow] = useState<FlowNotes>(() => {
    try { const local = localStorage.getItem(keyOf(debateId, uid)); if (local) return JSON.parse(local) as FlowNotes } catch { /* private mode */ }
    return initial ?? {}
  })
  const [state, setState] = useState<'saved' | 'saving' | 'offline'>('saved')
  const [open, setOpen] = useState(0) // phones: one speech at a time
  const timer = useRef<number | undefined>(undefined)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) { first.current = false; return }
    try { localStorage.setItem(keyOf(debateId, uid), JSON.stringify(flow)) } catch { /* private mode */ }
    setState('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      onSave(flow).then(() => {
        setState('saved')
        try { localStorage.removeItem(keyOf(debateId, uid)) } catch { /* private mode */ }
      }, () => setState('offline'))
    }, 800)
  }, [flow]) // eslint-disable-line react-hooks/exhaustive-deps

  // written offline: sent again as soon as the connection is back
  useEffect(() => {
    if (state !== 'offline') return
    const retry = () => onSave(flow).then(() => {
      setState('saved')
      try { localStorage.removeItem(keyOf(debateId, uid)) } catch { /* private mode */ }
    }, () => undefined)
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [state, flow]) // eslint-disable-line react-hooks/exhaustive-deps

  const add = (i: number, entry: FlowEntry) => setFlow(f => ({ ...f, [i]: [...(f[i] ?? []), entry] }))
  const remove = (i: number, k: number) => setFlow(f => ({ ...f, [i]: (f[i] ?? []).filter((_, j) => j !== k) }))
  const count = (i: number) => flow[i]?.length ?? 0

  return (
    <Card className="mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <p className="flex items-center gap-2 font-bold"><NotebookPen className="size-4 text-primary" />{t('flow.title')}</p>
        <span className={cn('flex items-center gap-1.5 text-xs font-semibold', state === 'offline' ? 'text-accent-foreground dark:text-accent' : 'text-muted-foreground')}>
          {state === 'saving' ? <Loader2 className="size-3.5 animate-spin" /> : state === 'offline' ? <CloudOff className="size-3.5" /> : <Check className="size-3.5 text-success" />}
          {t(`flow.state.${state}`)}
        </span>
      </div>
      <p className="px-5 pt-3 text-xs text-muted-foreground">{t('flow.hint')}</p>
      {/* phones: the speeches as chips, one column below */}
      <div className="flex gap-1.5 overflow-x-auto px-5 pt-3 [scrollbar-width:none] md:hidden">
        {speeches.map((_, i) => (
          <button key={i} type="button" onClick={() => setOpen(i)} aria-pressed={open === i}
            className={cn('shrink-0 cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold', open === i ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>
            {i + 1}{count(i) ? ` · ${count(i)}` : ''}
          </button>
        ))}
      </div>
      <div className="flex gap-3 overflow-x-auto p-5 md:snap-x">
        {speeches.map((s, i) => (
          <div key={i} className={cn('w-full shrink-0 snap-start rounded-xl border border-t-4 border-border bg-muted/30 p-3 md:w-64', SIDE_LOOK[s.side], open !== i && 'hidden md:block')}>
            <p className="text-xs font-bold leading-snug">{i + 1}. {s.role[lang]}</p>
            <ul className="mt-2 space-y-1.5">
              {(flow[i] ?? []).map((e, k) => (
                <li key={k} className="group flex items-start gap-1.5 rounded-lg bg-card px-2 py-1.5 text-sm shadow-sm">
                  <FlowTagBadge tag={e.tag} />
                  <span className="min-w-0 flex-1 break-words leading-snug">{e.text}</span>
                  <button type="button" onClick={() => remove(i, k)} aria-label={t('common.delete')}
                    className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground opacity-60 hover:bg-danger-soft hover:text-danger hover:opacity-100"><X className="size-3.5" /></button>
                </li>
              ))}
            </ul>
            <NoteInput onAdd={e => add(i, e)} />
          </div>
        ))}
      </div>
    </Card>
  )
}

// a new note: the tag first, then the line (Enter adds it and keeps the tag for the next one)
function NoteInput({ onAdd }: { onAdd: (e: FlowEntry) => void }) {
  const { t } = useTranslation()
  const [tag, setTag] = useState<FlowTag>('arg')
  const [text, setText] = useState('')
  const submit = () => { const v = text.trim(); if (!v) return; onAdd({ tag, text: v.slice(0, 300) }); setText('') }
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1">
        {FLOW_TAGS.map(x => (
          <button key={x} type="button" onClick={() => setTag(x)} aria-pressed={tag === x}
            className={cn('cursor-pointer rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-opacity', TAG_LOOK[x], tag === x ? 'ring-2 ring-current' : 'opacity-60 hover:opacity-100')}>
            {t(`flow.tags.${x}`)}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1">
        <input value={text} maxLength={300} onChange={e => setText(e.target.value)} placeholder={t('flow.placeholder')}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
          className="h-9 min-w-0 flex-1 rounded-lg border-2 border-border bg-card px-2 text-sm focus:border-primary focus:outline-none" />
        <button type="button" onClick={submit} aria-label={t('flow.add')} disabled={!text.trim()}
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg bg-primary text-primary-foreground disabled:cursor-default disabled:opacity-40"><Plus className="size-4" /></button>
      </div>
    </div>
  )
}

// a judge's flow, read only (the organizers and the panel reading the ballots)
export function FlowView({ formatCode, flow }: { formatCode: string; flow: FlowNotes }) {
  const { i18n } = useTranslation()
  const lang = i18n.language === 'kz' ? 'kz' : 'ru'
  const speeches = formatOfTournament(formatCode).speeches
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {speeches.map((s, i) => (flow[i]?.length ? (
        <div key={i} className={cn('w-56 shrink-0 rounded-xl border border-t-4 border-border bg-muted/30 p-3', SIDE_LOOK[s.side])}>
          <p className="text-xs font-bold leading-snug">{i + 1}. {s.role[lang]}</p>
          <ul className="mt-2 space-y-1.5">
            {flow[i].map((e, k) => (
              <li key={k} className="flex items-start gap-1.5 rounded-lg bg-card px-2 py-1.5 text-sm"><FlowTagBadge tag={e.tag} /><span className="min-w-0 break-words leading-snug">{e.text}</span></li>
            ))}
          </ul>
        </div>
      ) : null))}
    </div>
  )
}
