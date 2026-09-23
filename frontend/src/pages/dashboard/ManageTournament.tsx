import { useEffect, useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  ArrowLeft, ArrowLeftRight, BarChart3, CheckCircle2, ClipboardList, ExternalLink, Gavel, LayoutDashboard, ListOrdered, Megaphone,
  Pencil, Plus, Settings, Shuffle, Trash2, Users,
} from 'lucide-react'
import { getTournamentById, NotFoundError } from '@/api'
import type { Debate, Judge, Round, Team, TournamentDetails } from '@/types'
import { useAsync } from '@/lib/hooks'
import { cn, formatDateRange, initials } from '@/lib/utils'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Input, Label, Select, Switch, Textarea } from '@/components/ui/input'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import { ResultsTab } from '@/pages/TournamentPage'
import NotFound from '@/pages/NotFound'

const sections = [
  { key: 'overview', icon: LayoutDashboard },
  { key: 'teams', icon: Users },
  { key: 'judges', icon: Gavel },
  { key: 'rounds', icon: ListOrdered },
  { key: 'draw', icon: Shuffle },
  { key: 'ballots', icon: ClipboardList },
  { key: 'results', icon: BarChart3 },
  { key: 'settings', icon: Settings },
] as const
type Section = (typeof sections)[number]['key']

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
      {action}
    </div>
  )
}

/* ---------- Overview ---------- */
function Overview({ data, teams, judges, rounds, debates }: { data: TournamentDetails; teams: Team[]; judges: Judge[]; rounds: Round[]; debates: Debate[] }) {
  const { t } = useTranslation()
  const done = rounds.filter(r => r.status === 'completed').length
  const submitted = debates.filter(d => d.ballotStatus !== 'pending').length
  const stats = [
    { label: t('dashboard.overview.teams'), value: `${teams.length}/${data.maxTeams}`, icon: Users, color: 'bg-primary-soft text-primary' },
    { label: t('dashboard.overview.judges'), value: judges.length, icon: Gavel, color: 'bg-accent-soft text-navy dark:text-accent' },
    { label: t('dashboard.overview.rounds'), value: `${done}/${rounds.length}`, icon: ListOrdered, color: 'bg-success-soft text-success' },
    { label: t('dashboard.overview.ballots'), value: `${submitted}/${debates.length}`, icon: ClipboardList, color: 'bg-danger-soft text-danger' },
  ]
  const [checks, setChecks] = useState([true, false, false, false])
  return (
    <>
      <SectionTitle title={t('dashboard.nav.overview')} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-5">
            <span className={cn('grid size-10 place-items-center rounded-xl', color)}><Icon className="size-5" /></span>
            <p className="mt-4 text-3xl font-extrabold tabular-nums">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-6 p-6">
        <h3 className="text-lg font-bold">{t('dashboard.overview.next')}</h3>
        <ul className="mt-4 space-y-2">
          {[1, 2, 3, 4].map((n, i) => (
            <li key={n}>
              <button onClick={() => setChecks(c => c.map((v, k) => (k === i ? !v : v)))}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left text-sm font-medium hover:bg-muted">
                <CheckCircle2 className={cn('size-5 shrink-0', checks[i] ? 'text-success' : 'text-border')} fill={checks[i] ? 'currentColor' : 'none'} stroke={checks[i] ? 'white' : 'currentColor'} />
                <span className={cn(checks[i] && 'text-muted-foreground line-through')}>{t(`dashboard.overview.checklist${n}`)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

/* ---------- Teams ---------- */
function TeamDialog({ team, open, onOpenChange, onSave }: { team: Team | null; open: boolean; onOpenChange: (v: boolean) => void; onSave: (t: Team) => void }) {
  const { t } = useTranslation()
  const empty: Team = { id: '', tournamentId: '', name: '', institution: '', city: '', speakers: [0, 1, 2].map(i => ({ id: `new-s${i}`, name: '', teamId: '' })) }
  const [form, setForm] = useState<Team>(team ?? empty)
  useEffect(() => { if (open) setForm(team ?? empty) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const valid = form.name.trim() && form.institution.trim() && form.speakers.every(s => s.name.trim())
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent heading={team ? t('dashboard.teams.editTitle') : t('dashboard.teams.addTitle')}>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (valid) onSave(form) }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="tn">{t('tournament.registerDialog.teamName')}</Label><Input id="tn" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label htmlFor="ti">{t('tournament.registerDialog.institution')}</Label><Input id="ti" value={form.institution} onChange={e => setForm({ ...form, institution: e.target.value })} /></div>
          </div>
          {form.speakers.map((s, i) => (
            <div key={s.id}>
              <Label htmlFor={`sp${i}`}>{t('tournament.registerDialog.speaker', { n: i + 1 })}</Label>
              <Input id={`sp${i}`} value={s.name} onChange={e => setForm({ ...form, speakers: form.speakers.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button type="submit" disabled={!valid}>{t('common.save')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Teams({ teams, setTeams, max }: { teams: Team[]; setTeams: (t: Team[]) => void; max: number }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<Team | null>(null)
  const [open, setOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Team | null>(null)
  const save = (team: Team) => {
    if (team.id) setTeams(teams.map(x => (x.id === team.id ? team : x)))
    else setTeams([...teams, { ...team, id: `new-${Date.now()}`, city: '—' }])
    setOpen(false)
    toast.success(t('dashboard.teams.saved'))
  }
  return (
    <>
      <SectionTitle title={`${t('dashboard.nav.teams')} · ${teams.length}/${max}`}
        action={<Button onClick={() => { setEditing(null); setOpen(true) }}><Plus className="size-4" />{t('dashboard.teams.add')}</Button>} />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-5 py-3">{t('common.team')}</th><th className="px-5 py-3">{t('tournament.speakers')}</th><th className="w-28 px-5 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {teams.map(team => (
              <tr key={team.id} className="hover:bg-muted/40">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-xs font-bold text-primary">{initials(team.name)}</span>
                    <div><p className="font-bold">{team.name}</p><p className="text-xs text-muted-foreground">{team.institution}</p></div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">{team.speakers.map(s => s.name).join(', ')}</td>
                <td className="px-5 py-3.5">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" aria-label={t('common.edit')} onClick={() => { setEditing(team); setOpen(true) }}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label={t('common.delete')} className="hover:text-danger" onClick={() => setToDelete(team)}><Trash2 className="size-4" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <TeamDialog team={editing} open={open} onOpenChange={setOpen} onSave={save} />
      <Dialog open={!!toDelete} onOpenChange={o => !o && setToDelete(null)}>
        <DialogContent heading={t('dashboard.teams.confirmDelete', { name: toDelete?.name })}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button variant="danger" onClick={() => { setTeams(teams.filter(x => x.id !== toDelete?.id)); setToDelete(null); toast(t('dashboard.teams.deleted')) }}>
              <Trash2 className="size-4" />{t('common.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ---------- Judges ---------- */
function Judges({ judges, setJudges }: { judges: Judge[]; setJudges: (j: Judge[]) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', institution: '', rating: 7 })
  return (
    <>
      <SectionTitle title={`${t('dashboard.nav.judges')} · ${judges.length}`} action={<Button onClick={() => setOpen(true)}><Plus className="size-4" />{t('dashboard.judges.add')}</Button>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {judges.map(j => (
          <Card key={j.id} className="flex items-center gap-3 p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">{initials(j.name)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{j.name}</p>
              <p className="truncate text-xs text-muted-foreground">{j.institution}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{t('tournament.rating')}</p>
              <p className="font-extrabold text-primary">{j.rating}/10</p>
            </div>
          </Card>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent heading={t('dashboard.judges.addTitle')}>
          <form className="space-y-4" onSubmit={e => {
            e.preventDefault()
            if (!form.name.trim()) return
            setJudges([...judges, { id: `j-${Date.now()}`, tournamentId: '', ...form }])
            setForm({ name: '', institution: '', rating: 7 }); setOpen(false); toast.success(t('dashboard.teams.saved'))
          }}>
            <div><Label htmlFor="jn">{t('auth.name')}</Label><Input id="jn" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label htmlFor="ji">{t('common.institution')}</Label><Input id="ji" value={form.institution} onChange={e => setForm({ ...form, institution: e.target.value })} /></div>
            <div>
              <Label htmlFor="jr">{t('tournament.rating')}: <b className="text-primary">{form.rating}</b></Label>
              <input id="jr" type="range" min={1} max={10} value={form.rating} onChange={e => setForm({ ...form, rating: Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
            </div>
            <div className="flex justify-end gap-2"><DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose><Button type="submit">{t('common.save')}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ---------- Rounds ---------- */
function Rounds({ rounds, setRounds }: { rounds: Round[]; setRounds: (r: Round[]) => void }) {
  const { t } = useTranslation()
  const update = (id: string, patch: Partial<Round>) => setRounds(rounds.map(r => (r.id === id ? { ...r, ...patch } : r)))
  return (
    <>
      <SectionTitle title={t('dashboard.nav.rounds')} />
      <div className="space-y-4">
        {rounds.map(r => (
          <Card key={r.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">{r.number}</span>
                <p className="font-bold">{r.name}</p>
                <Badge variant={r.status === 'completed' ? 'muted' : r.status === 'released' ? 'accent' : 'outline'}>{t(`tournament.roundStatus.${r.status}`)}</Badge>
              </div>
              {r.status === 'draft' && (
                <Button size="sm" onClick={() => { update(r.id, { status: 'released' }); toast.success(t('dashboard.rounds.released')) }}>
                  <Megaphone className="size-4" />{t('dashboard.rounds.release')}
                </Button>
              )}
            </div>
            <div className="mt-4">
              <Label htmlFor={`m-${r.id}`}>{t('dashboard.rounds.motion')}</Label>
              <Textarea id={`m-${r.id}`} rows={2} value={r.motion} disabled={r.status === 'completed'} onChange={e => update(r.id, { motion: e.target.value })} />
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}

/* ---------- Draw ---------- */
const rooms = ['Ауд. 101', 'Ауд. 102', 'Ауд. 203', 'Ауд. 204', 'Ауд. 305', 'Актовый зал', 'Ауд. 310', 'Ауд. 412', 'Ауд. 415', 'Библиотека', 'Ауд. 501', 'Ауд. 502']

function Draw({ rounds, teams, judges, debates, setDebates }: { rounds: Round[]; teams: Team[]; judges: Judge[]; debates: Debate[]; setDebates: (d: Debate[]) => void }) {
  const { t } = useTranslation()
  const [roundId, setRoundId] = useState((rounds.find(r => r.status === 'released') ?? rounds.find(r => r.status === 'draft') ?? rounds[0]).id)
  const current = debates.filter(d => d.roundId === roundId)
  const others = debates.filter(d => d.roundId !== roundId)
  const round = rounds.find(r => r.id === roundId)!
  const team = (id: string) => teams.find(x => x.id === id)
  const editable = round.status !== 'completed'

  const generate = () => {
    const shuffled = [...teams].sort(() => Math.random() - 0.5)
    const next: Debate[] = []
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      const k = i / 2
      next.push({
        id: `${roundId}-g${k}`, roundId, room: rooms[k % rooms.length],
        propositionTeamId: shuffled[i].id, oppositionTeamId: shuffled[i + 1].id,
        judgeIds: [judges[k % judges.length]?.id].filter(Boolean) as string[], ballotStatus: 'pending',
      })
    }
    setDebates([...others, ...next])
    toast.success(t('dashboard.draw.generated'))
  }
  const patch = (id: string, p: Partial<Debate>) => setDebates(debates.map(d => (d.id === id ? { ...d, ...p } : d)))

  return (
    <>
      <SectionTitle title={t('dashboard.nav.draw')}
        action={
          <div className="flex flex-wrap gap-2">
            <Select value={roundId} onChange={e => setRoundId(e.target.value)} className="h-10" containerClassName="w-40" aria-label={t('dashboard.draw.round')}>
              {rounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            {editable && <Button variant="outline" onClick={generate}><Shuffle className="size-4" />{current.length ? t('dashboard.draw.regenerate') : t('dashboard.draw.generate')}</Button>}
            {editable && current.length > 0 && <Button onClick={() => toast.success(t('dashboard.draw.published'))}><Megaphone className="size-4" />{t('dashboard.draw.publish')}</Button>}
          </div>
        } />
      {current.length === 0 ? (
        <EmptyState icon={<Shuffle className="size-7" />} title={t('dashboard.draw.empty')} text={t('dashboard.draw.emptyText')}
          action={<Button onClick={generate}><Shuffle className="size-4" />{t('dashboard.draw.generate')}</Button>} />
      ) : (
        <>
          {editable && <p className="mb-3 text-sm text-muted-foreground">{t('dashboard.draw.hint')}</p>}
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t('tournament.room')}</th>
                  <th className="px-4 py-3">{t('tournament.proposition')}</th>
                  <th className="w-12 px-2 py-3" />
                  <th className="px-4 py-3">{t('tournament.opposition')}</th>
                  <th className="px-4 py-3">{t('tournament.judges')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {current.map(d => (
                  <tr key={d.id}>
                    <td className="px-4 py-3">
                      <Select value={d.room} disabled={!editable} onChange={e => patch(d.id, { room: e.target.value })} className="h-9 text-xs" containerClassName="w-36">
                        {rooms.map(r => <option key={r}>{r}</option>)}
                      </Select>
                    </td>
                    <td className="px-4 py-3 font-bold">{team(d.propositionTeamId)?.name}</td>
                    <td className="px-2 py-3">
                      <Button variant="ghost" size="icon" disabled={!editable} title={t('dashboard.draw.swap')} aria-label={t('dashboard.draw.swap')}
                        onClick={() => patch(d.id, { propositionTeamId: d.oppositionTeamId, oppositionTeamId: d.propositionTeamId })}>
                        <ArrowLeftRight className="size-4" />
                      </Button>
                    </td>
                    <td className="px-4 py-3 font-bold">{team(d.oppositionTeamId)?.name}</td>
                    <td className="px-4 py-3">
                      <Select value={d.judgeIds[0] ?? ''} disabled={!editable} onChange={e => patch(d.id, { judgeIds: [e.target.value, ...d.judgeIds.slice(1)] })} className="h-9 text-xs" containerClassName="w-52">
                        {judges.map(j => <option key={j.id} value={j.id}>{j.name} ({j.rating})</option>)}
                      </Select>
                      {d.judgeIds.length > 1 && <p className="mt-1 text-xs text-muted-foreground">+ {d.judgeIds.slice(1).map(id => judges.find(j => j.id === id)?.name).join(', ')}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  )
}

/* ---------- Ballots ---------- */
function Ballots({ rounds, teams, debates }: { rounds: Round[]; teams: Team[]; debates: Debate[] }) {
  const { t } = useTranslation()
  const active = rounds.filter(r => r.status !== 'draft')
  const [roundId, setRoundId] = useState(active.at(-1)?.id ?? '')
  const list = debates.filter(d => d.roundId === roundId)
  const done = list.filter(d => d.ballotStatus !== 'pending').length
  const variant = { pending: 'outline', submitted: 'accent', confirmed: 'success' } as const
  if (!active.length) return <><SectionTitle title={t('dashboard.nav.ballots')} /><EmptyState icon={<ClipboardList className="size-7" />} title={t('tournament.noDraw')} /></>
  return (
    <>
      <SectionTitle title={t('dashboard.nav.ballots')}
        action={<Select value={roundId} onChange={e => setRoundId(e.target.value)} className="h-10" containerClassName="w-40">{active.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>} />
      <Card className="mb-4 p-5">
        <div className="flex justify-between text-sm font-semibold"><span>{t('dashboard.ballots.progress', { done, total: list.length })}</span><span className="text-primary">{list.length ? Math.round((done / list.length) * 100) : 0}%</span></div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-success transition-all" style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} /></div>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map(d => (
          <Card key={d.id} className="flex items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-muted-foreground">{d.room}</p>
              <p className="truncate font-bold">{teams.find(x => x.id === d.propositionTeamId)?.name} <span className="text-muted-foreground">vs</span> {teams.find(x => x.id === d.oppositionTeamId)?.name}</p>
            </div>
            <Badge variant={variant[d.ballotStatus]}>{t(`dashboard.ballots.${d.ballotStatus}`)}</Badge>
            <Button asChild variant="ghost" size="icon" aria-label={t('dashboard.ballots.open')} title={t('dashboard.ballots.open')}>
              <Link to={`/ballot/${d.id}`}><ExternalLink className="size-4" /></Link>
            </Button>
          </Card>
        ))}
      </div>
    </>
  )
}

/* ---------- Settings ---------- */
function SettingsSection({ data }: { data: TournamentDetails }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(true)
  return (
    <>
      <SectionTitle title={t('dashboard.nav.settings')} />
      <div className="space-y-5">
        <Card className="space-y-4 p-6">
          <h3 className="font-bold">{t('dashboard.settings.general')}</h3>
          <div><Label htmlFor="s-name">{t('wizard.name')}</Label><Input id="s-name" defaultValue={data.name} /></div>
          <div><Label htmlFor="s-desc">{t('wizard.description')}</Label><Textarea id="s-desc" defaultValue={data.description} /></div>
          <Switch label={t('dashboard.settings.visibility')} checked={visible} onChange={setVisible} />
          <div className="flex justify-end"><Button onClick={() => toast.success(t('dashboard.teams.saved'))}>{t('common.save')}</Button></div>
        </Card>
        <Card className="flex items-center justify-between gap-4 p-6">
          <div><h3 className="font-bold">{t('dashboard.settings.plan')}</h3><p className="text-sm text-muted-foreground">{t('dashboard.settings.planFree')}</p></div>
          <Button asChild variant="outline"><Link to="/pricing">{t('nav.pricing')}</Link></Button>
        </Card>
        <Card className="border-danger/40 p-6">
          <h3 className="font-bold text-danger">{t('dashboard.settings.danger')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.settings.dangerText')}</p>
          <Button variant="danger" className="mt-4" onClick={() => toast.error(t('dashboard.settings.dangerText'))}><Trash2 className="size-4" />{t('dashboard.settings.deleteTournament')}</Button>
        </Card>
      </div>
    </>
  )
}

export default function ManageTournament() {
  const { id = '', section = 'overview' } = useParams()
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => getTournamentById(id), [id])
  const [teams, setTeams] = useState<Team[]>([])
  const [judges, setJudges] = useState<Judge[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [debates, setDebates] = useState<Debate[]>([])

  useEffect(() => {
    if (!data) return
    setTeams(data.teams); setJudges(data.judges); setRounds(data.rounds); setDebates(data.debates)
  }, [data])

  if (error instanceof NotFoundError) return <NotFound />
  if (error) return <div className="p-10"><ErrorState onRetry={reload} /></div>
  if (loading || !data || !rounds.length) {
    return <div className="mx-auto grid max-w-[90rem] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[240px_1fr]"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>
  }

  const current = (sections.some(s => s.key === section) ? section : 'overview') as Section

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 sm:py-8">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />{t('dashboard.myTournaments')}</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{data.name}</h1>
        <Badge variant="glass" className="border border-border"><StatusDot status={data.status} />{t(`status.${data.status}`)}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{formatDateRange(data.startDate, data.endDate)} · {data.city}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:block lg:space-y-1 lg:px-0">
          <div className="contents lg:block lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-2">
            {sections.map(({ key, icon: Icon }) => (
              <NavLink key={key} to={`/dashboard/tournaments/${id}${key === 'overview' ? '' : `/${key}`}`} end
                className={cn('flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
                  current === key ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <Icon className="size-4" />{t(`dashboard.nav.${key}`)}
              </NavLink>
            ))}
          </div>
          <Link to={`/tournaments/${id}`} className="hidden items-center gap-2 px-3.5 pt-4 text-xs font-semibold text-primary hover:underline lg:flex">
            <ExternalLink className="size-3.5" />{t('dashboard.public')}
          </Link>
        </nav>

        <section className="min-w-0">
          {current === 'overview' && <Overview data={data} teams={teams} judges={judges} rounds={rounds} debates={debates} />}
          {current === 'teams' && <Teams teams={teams} setTeams={setTeams} max={data.maxTeams} />}
          {current === 'judges' && <Judges judges={judges} setJudges={setJudges} />}
          {current === 'rounds' && <Rounds rounds={rounds} setRounds={setRounds} />}
          {current === 'draw' && <Draw rounds={rounds} teams={teams} judges={judges} debates={debates} setDebates={setDebates} />}
          {current === 'ballots' && <Ballots rounds={rounds} teams={teams} debates={debates} />}
          {current === 'results' && <><SectionTitle title={t('dashboard.nav.results')} /><ResultsTab id={id} kind="teams" /></>}
          {current === 'settings' && <SettingsSection data={data} />}
        </section>
      </div>
    </div>
  )
}
