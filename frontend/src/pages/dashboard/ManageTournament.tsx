import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  ArrowLeft, ArrowLeftRight, BarChart3, Check, CheckCircle2, ClipboardList, ExternalLink, Flag, Gavel, Inbox, LayoutDashboard, ListOrdered,
  Award, CalendarClock, ChevronRight, Circle, Clock, DoorOpen, Eye, EyeOff, ShieldAlert, Trophy, Mail, UserX, Loader2, Presentation, Megaphone, Pencil, Play, Plus, QrCode, RefreshCw, RotateCcw, Settings, Shuffle, Trash2, Undo2, UserPlus, Users, X,
} from 'lucide-react'
import {
  type DrawMethod, type DrawReport, addTeam, getSelection, runSelectionLottery, announceBreak, cancelBreak, setJudgeConflicts, setTeamCategories, getJudgeFeedback, type JudgeFeedbackSummary, inviteByEmail, deleteJudge, deleteTeam, deleteTournament, generateDraw, getCheckin, newCheckinCode, resetCheckin, setTeamCheckin, getRegistrations, getTournamentById, NotFoundError, setRegistrationStatus,
  updateDebate, updateRound, updateSchedule, updateTeam, updateTournament, type TeamInput,
} from '@/api'
import type { Debate, Judge, Round, ScheduleItem, Team, TournamentDetails, TournamentStatus } from '@/types'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { cn, formatDate, formatDateRange, formatDateTime, initials } from '@/lib/utils'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Input, Label, Switch, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import { ResultsTab } from '@/pages/TournamentPage'
import NotFound from '@/pages/NotFound'
import { InviteButton } from '@/components/tournament/InviteDialog'
import { EmailInvites } from '@/components/tournament/EmailInvites'
import { CoverCard } from '@/components/tournament/CoverCard'

// mirrors backend services/draw.ts: the first two rounds keep clubmates apart by default
const CLUB_PROTECTED_ROUNDS = 2
import { ModerationBanner } from '@/components/tournament/ModerationBadge'
import { DatePicker } from '@/components/ui/date-picker'
import { TimePicker } from '@/components/ui/time-picker'
import { QrCode as QrCodeImage } from '@/components/certificate/QrCode'
import { PaymentCard } from '@/components/payments/PaymentCard'
import { FREE_TEAM_LIMIT } from '@/lib/plans'
import { EntityLogo } from '@/components/ui/entity-logo'
import { isBP, sidesOf, teamIdOn, useSides } from '@/lib/formats'
import { useRoundName } from '@/lib/rounds'
import { OnlineLink } from '@/components/tournament/OnlineLink'
import { conflictReason } from '@/lib/conflicts'
import { PlacePicker, placeCity } from '@/components/tournament/PlacePicker'
import { regionOfCity } from '@/content/geo'
import { JudgeFeedbackDialog, Stars } from '@/components/tournament/JudgeFeedback'
import { formatOfTournament } from '@/content/formats'

const sections = [
  { key: 'overview', icon: LayoutDashboard },
  { key: 'registrations', icon: Inbox },
  { key: 'teams', icon: Users },
  { key: 'judges', icon: Gavel },
  { key: 'schedule', icon: CalendarClock },
  { key: 'rounds', icon: ListOrdered },
  { key: 'draw', icon: Shuffle },
  { key: 'ballots', icon: ClipboardList },
  { key: 'results', icon: BarChart3 },
  { key: 'settings', icon: Settings },
] as const
type Section = (typeof sections)[number]['key']

// used when the organizer has not listed their own rooms
const DEFAULT_ROOMS = ['Ауд. 101', 'Ауд. 102', 'Ауд. 203', 'Ауд. 204', 'Ауд. 305', 'Актовый зал', 'Ауд. 310', 'Ауд. 412', 'Ауд. 415', 'Библиотека', 'Ауд. 501', 'Ауд. 502']

interface SectionProps {
  data: TournamentDetails
  reload: () => void
}

function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
      {action}
    </div>
  )
}

// runs an API action with a busy flag, toast on success and a translated toast on error
function useAction() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key)
    try {
      await fn()
      if (success) toast.success(success)
      return true
    } catch (e) {
      toast.error(errorMessage(e, t))
      return false
    } finally {
      setBusy(null)
    }
  }
  return { busy, run }
}

/* ---------- Overview ---------- */
function Overview({ data }: SectionProps) {
  const { t } = useTranslation()
  const roundName = useRoundName()
  const done = data.rounds.filter(r => r.status === 'completed').length
  const live = data.debates.filter(d => data.rounds.find(r => r.id === d.roundId)?.status === 'released')
  const submitted = live.filter(d => d.ballotStatus !== 'pending').length
  const stats = [
    { label: t('dashboard.overview.teams'), value: `${data.teams.length}/${data.maxTeams}`, icon: Users, color: 'bg-primary-soft text-primary' },
    { label: t('dashboard.overview.judges'), value: data.judges.length, icon: Gavel, color: 'bg-accent-soft text-navy dark:text-accent' },
    { label: t('dashboard.overview.rounds'), value: `${done}/${data.rounds.length}`, icon: ListOrdered, color: 'bg-success-soft text-success' },
    { label: t('dashboard.overview.ballots'), value: `${submitted}/${live.length}`, icon: ClipboardList, color: 'bg-danger-soft text-danger' },
  ]
  const nextRound = data.rounds.find(r => r.status !== 'completed')
  const teams = data.teams.filter(x => !x.swing).length
  const need = judgesNeeded(data)
  const drawn = !!nextRound && data.debates.some(d => d.roundId === nextRound.id)
  // each step is ticked automatically when it is really done; a click opens the section where it is done
  const steps = [
    { text: t('dashboard.overview.checklist1', { count: teams }), done: teams >= 2, to: 'teams' },
    { text: t('dashboard.overview.checklist2', { need, have: data.judges.length }), done: teams >= 2 && data.judges.length >= need, to: 'judges' },
    { text: t('dashboard.overview.checklistSchedule'), done: data.schedule.length > 0, to: 'schedule' },
    { text: t('dashboard.overview.checklistMotion'), done: !nextRound || !!nextRound.motion.trim(), to: 'rounds' },
    { text: t('dashboard.overview.checklist3'), done: !nextRound || drawn, to: 'draw' },
    { text: t('dashboard.overview.checklist4'), done: !nextRound || nextRound.status !== 'draft', to: 'draw' },
  ]
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
        <h3 className="text-lg font-bold">{t('dashboard.overview.next')}{nextRound && <span className="font-normal text-muted-foreground"> · {roundName(nextRound)}</span>}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.overview.checklistHint')}</p>
        <ul className="mt-4 space-y-1">
          {steps.map(s => (
            <li key={s.text}>
              <Link to={`/dashboard/tournaments/${data.id}/${s.to}`} className="group flex items-center gap-3 rounded-xl p-3 text-sm font-medium transition-colors hover:bg-muted">
                <CheckCircle2 className={cn('size-5 shrink-0', s.done ? 'text-success' : 'text-border')} fill={s.done ? 'currentColor' : 'none'} stroke={s.done ? 'white' : 'currentColor'} />
                <span className={cn('flex-1', s.done && 'text-muted-foreground line-through')}>{s.text}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

/* ---------- Registrations ---------- */
function Registrations({ data, reload }: SectionProps) {
  const { t } = useTranslation()
  const regs = useAsync(() => getRegistrations(data.id), [data.id])
  const { busy, run } = useAction()
  const sel = useAsync(() => getSelection(data.id), [data.id])
  const refresh = () => { regs.reload(); sel.reload(); reload() }
  const decide = async (id: string, status: 'confirmed' | 'rejected' | 'waitlisted') => {
    if (await run(id, () => setRegistrationStatus(id, status), t(`dashboard.registrations.${status}Toast`))) refresh()
  }
  const variant = { pending: 'accent', confirmed: 'success', rejected: 'danger', waitlisted: 'outline' } as const
  const [quota, setQuota] = useState(data.clubQuota ? String(data.clubQuota) : '')
  const setMode = async (selectionMode: 'manual' | 'first_come' | 'lottery') => { if (await run('mode', () => updateTournament(data.id, { selectionMode }), t('dashboard.teams.saved'))) refresh() }
  const saveQuota = async () => { if (await run('quota', () => updateTournament(data.id, { clubQuota: quota ? Number(quota) : null }), t('dashboard.teams.saved'))) refresh() }
  const lottery = async () => {
    let r: { confirmed: number; waitlisted: number } | undefined
    if (await run('lottery', async () => { r = await runSelectionLottery(data.id) })) { toast.success(t('dashboard.selection.lotteryDone', r)); refresh() }
  }
  const mode = data.selectionMode ?? 'manual'
  return (
    <>
      <SectionTitle title={t('dashboard.nav.registrations')} />
      {data.status !== 'finished' && (
        <Card className="mb-5 space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-bold">{t('dashboard.selection.title')}</p>
              {sel.data && <p className="text-sm text-muted-foreground">{t('dashboard.selection.numbers', { applications: sel.data.applications, places: sel.data.places, taken: sel.data.taken, waitlisted: sel.data.waitlisted })}</p>}
            </div>
            {mode === 'lottery' && !data.lotteryAt && (
              <Button variant="accent" disabled={!!busy} onClick={lottery}>{busy === 'lottery' ? <Loader2 className="size-4 animate-spin" /> : <Shuffle className="size-4" />}{t('dashboard.selection.runLottery')}</Button>
            )}
          </div>
          <div className="inline-flex flex-wrap rounded-xl bg-muted p-1" role="radiogroup" aria-label={t('dashboard.selection.title')}>
            {(['manual', 'first_come', 'lottery'] as const).map(m => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={!!busy || (m !== 'lottery' && !!data.lotteryAt)} onClick={() => mode !== m && setMode(m)}
                className={cn('cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50', mode === m ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground')}>
                {t(`dashboard.selection.modes.${m}`)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t(`dashboard.selection.hints.${mode}`)}{data.lotteryAt && ` ${t('dashboard.selection.lotteryAt', { time: formatDateTime(data.lotteryAt) })}`}</p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="club-quota">{t('dashboard.selection.quota')}</Label>
              <Input id="club-quota" type="number" min={1} max={32} className="w-40" placeholder={t('dashboard.selection.noQuota')} value={quota} onChange={e => setQuota(e.target.value)} />
            </div>
            <Button variant="outline" disabled={!!busy || quota === (data.clubQuota ? String(data.clubQuota) : '')} onClick={saveQuota}>{t('common.save')}</Button>
          </div>
        </Card>
      )}
      {regs.error ? <ErrorState onRetry={regs.reload} /> : !regs.data ? <Skeleton className="h-48" /> : regs.data.length === 0 ? (
        <EmptyState icon={<Inbox className="size-7" />} title={t('dashboard.registrations.empty')} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {regs.data.map(r => (
            <Card key={r.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{r.teamName}</p>
                  <p className="text-sm text-muted-foreground">{r.institution}</p>
                </div>
                <Badge variant={variant[r.status]}>{r.lotteryRank ? `№${r.lotteryRank} · ` : ''}{t(`profile.regStatus.${r.status}`)}</Badge>
              </div>
              <p className="mt-3 text-sm">{r.speakers.join(', ')}</p>
              <p className="mt-2 text-xs text-muted-foreground">{r.user.name} · {r.user.email} · {r.contactPhone}{r.club && ` · ${r.club}`}</p>
              {(r.status === 'pending' || r.status === 'waitlisted') && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" disabled={!!busy} onClick={() => decide(r.id, 'confirmed')}>
                    {busy === r.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{t('dashboard.registrations.confirm')}
                  </Button>
                  {r.status === 'pending' && (
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => decide(r.id, 'waitlisted')}><Clock className="size-4" />{t('dashboard.registrations.waitlist')}</Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-danger" disabled={!!busy} onClick={() => decide(r.id, 'rejected')}>
                    <X className="size-4" />{t('dashboard.registrations.reject')}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

/* ---------- Teams ---------- */
function TeamDialog({ team, open, onOpenChange, onSave, saving, speakers }: { team: Team | null; open: boolean; onOpenChange: (v: boolean) => void; onSave: (t: TeamInput) => void; saving: boolean; speakers: number }) {
  const { t } = useTranslation()
  // as many speakers as the tournament's format has (APF: 2, WSDC and Karl Popper: 3)
  const empty: TeamInput = { name: '', institution: '', speakers: Array.from({ length: speakers }, () => '') }
  const [form, setForm] = useState<TeamInput>(empty)
  useEffect(() => {
    if (open) setForm(team ? { name: team.name, institution: team.institution, speakers: team.speakers.map(s => s.name) } : empty)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const valid = form.name.trim().length >= 2 && form.institution.trim().length >= 2 && form.speakers.every(s => s.trim().length >= 3)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent heading={team ? t('dashboard.teams.editTitle') : t('dashboard.teams.addTitle')}>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (valid) onSave(form) }}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><Label htmlFor="tn">{t('tournament.registerDialog.teamName')}</Label><Input id="tn" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label htmlFor="ti">{t('tournament.registerDialog.institution')}</Label><Input id="ti" value={form.institution} onChange={e => setForm({ ...form, institution: e.target.value })} /></div>
          </div>
          {form.speakers.map((s, i) => (
            <div key={i}>
              <Label htmlFor={`sp${i}`}>{t('tournament.registerDialog.speaker', { n: i + 1 })}</Label>
              <Input id={`sp${i}`} value={s} onChange={e => setForm({ ...form, speakers: form.speakers.map((x, k) => (k === i ? e.target.value : x)) })} />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button type="submit" disabled={!valid || saving}>{saving && <Loader2 className="size-4 animate-spin" />}{t('common.save')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// venue check-in: a QR for teams to scan, the live count, a new code or a reset for the next day
function CheckinCard({ data, reload }: SectionProps) {
  const { t } = useTranslation()
  const { busy, run } = useAction()
  const status = useAsync(() => getCheckin(data.id), [data.id, data.teams.filter(x => x.checkedIn).length])
  const [show, setShow] = useState(false)
  const code = status.data?.code
  const url = code ? `${window.location.origin}/checkin/${data.id}?code=${code}` : ''
  const act = async (fn: () => Promise<unknown>) => { if (await run('checkin', fn)) { status.reload(); reload() } }
  return (
    <Card className="mb-5 flex flex-wrap items-center gap-4 p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><QrCode className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{t('dashboard.checkin.title')}</p>
        <p className="text-sm text-muted-foreground">
          {status.data ? t('dashboard.checkin.count', { present: status.data.present, total: status.data.total }) : '…'} · {t('dashboard.checkin.hint')}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy === 'checkin'} onClick={async () => { if (!code) await act(() => newCheckinCode(data.id)); setShow(true) }}><QrCode className="size-4" />{t('dashboard.checkin.showQr')}</Button>
        <Button variant="ghost" disabled={busy === 'checkin' || !status.data?.present} onClick={() => act(() => resetCheckin(data.id))}><RotateCcw className="size-4" />{t('dashboard.checkin.reset')}</Button>
      </div>
      <Dialog open={show && !!code} onOpenChange={setShow}>
        <DialogContent heading={t('dashboard.checkin.qrTitle')} description={t('dashboard.checkin.qrText')}>
          <div className="flex flex-col items-center gap-3">
            {url && <QrCodeImage value={url} size={280} className="rounded-xl border border-border" />}
            <p className="font-mono text-3xl font-extrabold tracking-[0.4em]">{code}</p>
            <p className="break-all text-center text-xs text-muted-foreground">{url}</p>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={busy === 'checkin'} onClick={() => act(() => newCheckinCode(data.id))}><RefreshCw className="size-4" />{t('dashboard.checkin.newCode')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function Teams({ data, reload }: SectionProps) {
  const { t } = useTranslation()
  const { busy, run } = useAction()
  const [editing, setEditing] = useState<Team | null>(null)
  const [open, setOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Team | null>(null)

  const save = async (input: TeamInput) => {
    const ok = await run('save', () => (editing ? updateTeam(editing.id, input) : addTeam(data.id, input)), t('dashboard.teams.saved'))
    if (ok) { setOpen(false); reload() }
  }
  const remove = async () => {
    if (await run('delete', () => deleteTeam(toDelete!.id), t('dashboard.teams.deleted'))) { setToDelete(null); reload() }
  }

  return (
    <>
      <SectionTitle title={`${t('dashboard.nav.teams')} · ${data.teams.filter(x => !x.swing).length}/${data.maxTeams}`}
        action={<Button disabled={data.teams.length >= data.maxTeams} onClick={() => { setEditing(null); setOpen(true) }}><Plus className="size-4" />{t('dashboard.teams.add')}</Button>} />
      {data.status !== 'finished' && data.teams.length > 0 && <CheckinCard data={data} reload={reload} />}
      {data.teams.length === 0 ? <EmptyState icon={<Users className="size-7" />} title={t('common.empty')} /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-5 py-3">{t('common.team')}</th><th className="px-5 py-3">{t('tournament.speakers')}</th><th className="w-44 px-5 py-3" /></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.teams.map(team => (
                <tr key={team.id} className="hover:bg-muted/40">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <EntityLogo src={team.logoUrl} name={team.name} size="sm" />
                      <div>
                        <p className="flex flex-wrap items-center gap-1.5 font-bold">{team.name}{team.swing && <Badge variant="outline">{t('dashboard.checkin.swing')}</Badge>}</p>
                        <p className="text-xs text-muted-foreground">{team.institution}</p>
                        {!team.swing && (data.breakCategories ?? []).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(data.breakCategories ?? []).map(c => {
                              const on = team.categories?.includes(c.key) ?? false
                              const locked = data.rounds.some(r => r.kind === 'elimination')
                              return (
                                <button key={c.key} type="button" disabled={locked || busy === `cat-${team.id}`} aria-pressed={on}
                                  onClick={async () => {
                                    const next = on ? (team.categories ?? []).filter(k => k !== c.key) : [...(team.categories ?? []), c.key]
                                    if (await run(`cat-${team.id}`, () => setTeamCategories(team.id, next))) reload()
                                  }}
                                  className={cn('cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:cursor-default',
                                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/50')}>
                                  {c.name}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{team.speakers.map(s => s.name).join(', ')}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-1">
                      {!team.swing && data.status !== 'finished' && (
                        <Button variant="ghost" size="sm" aria-pressed={!!team.checkedIn} disabled={busy === `ci-${team.id}`}
                          className={cn(team.checkedIn ? 'text-success' : 'text-muted-foreground')} title={t('dashboard.checkin.toggle')}
                          onClick={async () => { if (await run(`ci-${team.id}`, () => setTeamCheckin(team.id, !team.checkedIn))) reload() }}>
                          {team.checkedIn ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
                          <span className="hidden sm:inline">{team.checkedIn ? t('dashboard.checkin.present') : t('dashboard.checkin.absent')}</span>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" aria-label={t('common.edit')} onClick={() => { setEditing(team); setOpen(true) }}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label={t('common.delete')} className="hover:text-danger" onClick={() => setToDelete(team)}><Trash2 className="size-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <TeamDialog team={editing} open={open} onOpenChange={setOpen} onSave={save} saving={busy === 'save'} speakers={formatOfTournament(data.format).score.speakersPerTeam} />
      <Dialog open={!!toDelete} onOpenChange={o => !o && setToDelete(null)}>
        <DialogContent heading={t('dashboard.teams.confirmDelete', { name: toDelete?.name })}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button variant="danger" disabled={busy === 'delete'} onClick={remove}><Trash2 className="size-4" />{t('common.delete')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ---------- Judges ---------- */
function Judges({ data, reload }: SectionProps) {
  const { t } = useTranslation()
  const { busy, run } = useAction()
  // judges join only by invite; a judge added earlier by name gets an email invite that links their account
  const [linkFor, setLinkFor] = useState<Judge | null>(null)
  const [email, setEmail] = useState('')
  const [toDelete, setToDelete] = useState<Judge | null>(null)
  const [conflictsOf, setConflictsOf] = useState<Judge | null>(null)
  // speakers' ratings of the judges (organizers only)
  const feedback = useAsync(() => getJudgeFeedback(data.id), [data.id])
  const [readFeedback, setReadFeedback] = useState<Judge | null>(null)
  const feedbackOf = (id: string) => feedback.data?.find(f => f.judgeId === id)
  const remove = async () => {
    if (await run('delete', () => deleteJudge(toDelete!.id), t('dashboard.judges.deleted'))) { setToDelete(null); reload() }
  }
  const sendLink = async () => {
    if (!linkFor || !email.trim()) return
    const ok = await run('link', () => inviteByEmail(data.id, email.trim(), 'judge', linkFor.id), t('dashboard.judges.linkSent', { email: email.trim() }))
    if (ok) { setEmail(''); setLinkFor(null) }
  }
  const withoutAccount = data.judges.filter(j => j.hasAccount === false).length
  return (
    <>
      <SectionTitle title={`${t('dashboard.nav.judges')} · ${data.judges.length}`}
        action={
          <div className="flex flex-wrap gap-2">
            <InviteButton tournamentId={data.id} kind="judge" variant="primary" />
          </div>
        } />
      <p className="-mt-3 mb-5 text-sm text-muted-foreground">{t('dashboard.judges.inviteHint')}</p>
      {withoutAccount > 0 && (
        <p className="mb-5 flex items-start gap-2 rounded-2xl border border-accent bg-accent-soft px-4 py-3 text-sm">
          <UserX className="mt-0.5 size-4 shrink-0" />{t('dashboard.judges.withoutAccount', { count: withoutAccount })}
        </p>
      )}
      {data.status !== 'finished' && <div className="mb-5"><EmailInvites tournamentId={data.id} kind="judge" /></div>}
      {data.judges.length === 0 && <EmptyState icon={<Gavel className="size-7" />} title={t('dashboard.judges.empty')} text={t('dashboard.judges.emptyText')} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.judges.map(j => (
          <Card key={j.id} className="flex items-center gap-3 p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">{initials(j.name)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{j.name}</p>
              {j.hasAccount === false
                ? <button type="button" onClick={() => setLinkFor(j)} className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-danger hover:underline"><UserX className="size-3.5" />{t('dashboard.judges.noAccount')}</button>
                : <p className="truncate text-xs text-muted-foreground">{j.institution || '—'}</p>}
              {feedbackOf(j.id) && (
                <button type="button" onClick={() => setReadFeedback(j)} className="mt-0.5 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold hover:underline">
                  <Stars value={Math.round(feedbackOf(j.id)!.average)} size="size-3.5" />{feedbackOf(j.id)!.average} · {t('feedback.count', { count: feedbackOf(j.id)!.count })}
                </button>
              )}
            </div>
            {j.hasAccount === false && (
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => setLinkFor(j)}><Mail className="size-4" />{t('dashboard.judges.linkInvite')}</Button>
            )}
            <Button variant="ghost" size="sm" className="shrink-0 px-2" onClick={() => setConflictsOf(j)} title={t('dashboard.conflicts.title', { name: j.name })}>
              <ShieldAlert className="size-4" />{j.conflictTeamIds?.length ? j.conflictTeamIds.length : ''}
            </Button>
            <Button variant="ghost" size="icon" aria-label={t('common.delete')} title={t('common.delete')} className="hover:text-danger" onClick={() => setToDelete(j)}>
              <Trash2 className="size-4" />
            </Button>
          </Card>
        ))}
      </div>
      <Dialog open={!!linkFor} onOpenChange={o => !o && setLinkFor(null)}>
        <DialogContent heading={t('dashboard.judges.linkTitle', { name: linkFor?.name })} description={t('dashboard.judges.linkText')}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void sendLink() }}>
            <div><Label htmlFor="jl">{t('auth.email')}</Label><Input id="jl" type="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="judge@mail.kz" /></div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
              <Button type="submit" disabled={busy === 'link' || !/^\S+@\S+\.\S+$/.test(email.trim())}>{busy === 'link' ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}{t('dashboard.judges.linkSend')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConflictsDialog judge={conflictsOf} data={data} onClose={() => setConflictsOf(null)} onSaved={() => { setConflictsOf(null); reload() }} />
      <JudgeFeedbackDialog name={readFeedback?.name ?? ''} summary={readFeedback ? (feedbackOf(readFeedback.id) as JudgeFeedbackSummary) : null} onClose={() => setReadFeedback(null)} />
      <Dialog open={!!toDelete} onOpenChange={o => !o && setToDelete(null)}>
        <DialogContent heading={t('dashboard.judges.confirmDelete', { name: toDelete?.name })} description={t('dashboard.judges.deleteHint')}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button variant="danger" disabled={busy === 'delete'} onClick={remove}><Trash2 className="size-4" />{t('common.delete')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ---------- Rounds ---------- */
function RoundCard({ round, hasDraw, reload }: { round: Round; hasDraw: boolean; reload: () => void }) {
  const { t } = useTranslation()
  const roundName = useRoundName()
  const { busy, run } = useAction()
  const [motion, setMotion] = useState(round.motion)
  useEffect(() => setMotion(round.motion), [round.motion])
  const dirty = motion.trim() !== round.motion
  // why "publish" is not available yet, said next to the button instead of a silent grey button
  const blocker = round.status !== 'draft' ? null : !hasDraw ? t('dashboard.rounds.needDraw') : !motion.trim() ? t('dashboard.rounds.needMotion') : null

  const save = async () => { if (await run('save', () => updateRound(round.id, { motion }), t('dashboard.teams.saved'))) reload() }
  const release = async () => {
    if (await run('release', () => updateRound(round.id, { motion, status: 'released' }), t('dashboard.rounds.released'))) reload()
  }
  const complete = async () => { if (await run('complete', () => updateRound(round.id, { status: 'completed' }), t('dashboard.rounds.completedToast'))) reload() }
  const setSilent = async (silent: boolean) => { if (await run('silent', () => updateRound(round.id, { silent }), t(silent ? 'dashboard.rounds.closedToast' : 'dashboard.rounds.openedToast'))) reload() }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn('grid size-9 place-items-center rounded-lg text-sm font-bold', round.kind === 'elimination' ? 'bg-accent text-navy' : 'bg-primary text-primary-foreground')}>
            {round.kind === 'elimination' ? <Trophy className="size-4" /> : round.number}
          </span>
          <p className="font-bold">{roundName(round)}</p>
          <Badge variant={round.status === 'completed' ? 'muted' : round.status === 'released' ? 'accent' : 'outline'}>{t(`tournament.roundStatus.${round.status}`)}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {round.status !== 'completed' && (
            <Button asChild size="sm" variant="ghost" title={t('projector.open')}>
              <a href={`/tournaments/${round.tournamentId}/projector?round=${round.id}`} target="_blank" rel="noopener"><Presentation className="size-4" />{t('projector.short')}</a>
            </Button>
          )}
          {dirty && round.status !== 'completed' && <Button size="sm" variant="outline" disabled={!!busy} onClick={save}>{t('common.save')}</Button>}
          {round.status === 'draft' && (
            <Button size="sm" disabled={!!busy || !!blocker} title={blocker ?? undefined} onClick={release}>
              {busy === 'release' ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />}{t('dashboard.rounds.release')}
            </Button>
          )}
          {round.status === 'released' && (
            <Button size="sm" variant="accent" disabled={!!busy} onClick={complete}>
              {busy === 'complete' ? <Loader2 className="size-4 animate-spin" /> : <Flag className="size-4" />}{t('dashboard.rounds.complete')}
            </Button>
          )}
        </div>
      </div>
      <div className="mt-4">
        <Label htmlFor={`m-${round.id}`}>{t('dashboard.rounds.motion')}</Label>
        <Textarea id={`m-${round.id}`} rows={2} value={motion} disabled={round.status === 'completed'} onChange={e => setMotion(e.target.value)} placeholder={t('dashboard.rounds.motionPlaceholder')} />
        {blocker && <p className="mt-2 text-xs text-muted-foreground">{blocker}</p>}
      </div>
      {round.kind !== 'elimination' && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <span className="text-sm font-semibold">{t('dashboard.rounds.visibility')}</span>
          <div className="inline-flex rounded-xl bg-muted p-1" role="radiogroup" aria-label={t('dashboard.rounds.visibility')}>
            {([false, true] as const).map(v => (
              <button key={String(v)} type="button" role="radio" aria-checked={!!round.silent === v} disabled={!!busy} onClick={() => !!round.silent !== v && setSilent(v)}
                className={cn('flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all',
                  !!round.silent === v ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground')}>
                {v ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{t(v ? 'dashboard.rounds.closed' : 'dashboard.rounds.open')}
              </button>
            ))}
          </div>
          <p className="w-full text-xs text-muted-foreground">{t('dashboard.rounds.visibilityHint')}</p>
        </div>
      )}
    </Card>
  )
}

function Rounds({ data, reload }: SectionProps) {
  const { t } = useTranslation()
  const card = (r: Round) => <RoundCard key={r.id} round={r} hasDraw={data.debates.some(d => d.roundId === r.id)} reload={reload} />
  return (
    <>
      <SectionTitle title={t('dashboard.nav.rounds')} />
      <div className="space-y-4">
        {data.rounds.filter(r => r.kind !== 'elimination').map(card)}
        <BreakCard data={data} reload={reload} />
        {data.rounds.filter(r => r.kind === 'elimination').map(card)}
      </div>
    </>
  )
}

// The break: after the preliminary rounds the top teams of the table go to the playoffs.
// The bracket keeps seeds 1 and 2 apart until the final; the champion is the winner of the final.
function BreakCard({ data, reload }: SectionProps) {
  const { t } = useTranslation()
  const { busy, run } = useAction()
  const elimination = data.rounds.filter(r => r.kind === 'elimination')
  const prelims = data.rounds.filter(r => r.kind !== 'elimination')
  const seeds = data.teams.filter(x => x.breakSeed && !x.breakCategory).sort((a, b) => a.breakSeed! - b.breakSeed!)
  const categorySeeds = (data.breakCategories ?? []).map(c => ({ ...c, teams: data.teams.filter(x => x.breakCategory === c.key).sort((a, b) => a.breakSeed! - b.breakSeed!) }))
  const blocker = data.status !== 'ongoing' ? t('dashboard.break.needOngoing')
    : !prelims.length || prelims.some(r => r.status !== 'completed') ? t('dashboard.break.needPrelims') : null
  const canCancel = elimination.length > 0 && elimination.every(r => r.status === 'draft')
  const announce = async () => { if (await run('announce', () => announceBreak(data.id), t('dashboard.break.announcedToast'))) reload() }
  const cancel = async () => { if (await run('cancel', () => cancelBreak(data.id), t('dashboard.break.cancelledToast'))) reload() }
  return (
    <Card className="border-2 border-dashed border-accent p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-navy dark:text-accent"><Trophy className="size-4" /></span>
          <div>
            <p className="font-bold">{t('dashboard.break.title', { count: data.breakSize })}</p>
            <p className="text-xs text-muted-foreground">{t(isBP(data.format) ? 'dashboard.break.hintBP' : 'dashboard.break.hint')}</p>
          </div>
        </div>
        {elimination.length === 0 ? (
          <Button size="sm" variant="accent" disabled={!!busy || !!blocker} title={blocker ?? undefined} onClick={announce}>
            {busy === 'announce' ? <Loader2 className="size-4 animate-spin" /> : <Trophy className="size-4" />}{t('dashboard.break.announce')}
          </Button>
        ) : canCancel && (
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={cancel}>
            {busy === 'cancel' ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}{t('dashboard.break.cancel')}
          </Button>
        )}
      </div>
      {elimination.length === 0 && blocker && <p className="mt-3 text-xs text-muted-foreground">{blocker}</p>}
      {elimination.length === 0 && categorySeeds.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">{t('dashboard.categories.alsoBreak', { list: categorySeeds.map(c => `${c.name} (${c.size})`).join(', ') })}</p>
      )}
      {categorySeeds.filter(c => c.teams.length).map(c => (
        <div key={c.key} className="mt-4">
          <p className="text-sm font-bold">{c.name}</p>
          <ol className="mt-2 grid gap-2 sm:grid-cols-2">
            {c.teams.map(s => (
              <li key={s.id} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-extrabold text-navy">{s.breakSeed}</span>
                <span className="truncate font-semibold">{s.name}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {seeds.length > 0 && (
        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {seeds.map(s => (
            <li key={s.id} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground">{s.breakSeed}</span>
              <span className="truncate font-semibold">{s.name}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

// Conflicts of one judge: the organizer ticks the teams this judge must not judge; the institution and the judge's club
// count automatically and are shown, not editable
function ConflictsDialog({ judge, data, onClose, onSaved }: { judge: Judge | null; data: TournamentDetails; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const { busy, run } = useAction()
  const [sel, setSel] = useState<string[]>([])
  useEffect(() => { if (judge) setSel(judge.conflictTeamIds ?? []) }, [judge])
  if (!judge) return null
  const teams = data.teams.filter(x => !x.swing)
  const save = async () => { if (await run('conflicts', () => setJudgeConflicts(judge.id, sel), t('dashboard.conflicts.saved'))) onSaved() }
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent heading={t('dashboard.conflicts.title', { name: judge.name })} description={t('dashboard.conflicts.text')}>
        <ul className="max-h-80 space-y-1.5 overflow-y-auto">
          {teams.map(team => {
            const auto = conflictReason({ ...judge, conflictTeamIds: [] }, team)
            const on = sel.includes(team.id)
            return (
              <li key={team.id}>
                <button type="button" disabled={!!auto} aria-pressed={on || !!auto} onClick={() => setSel(s => (s.includes(team.id) ? s.filter(x => x !== team.id) : [...s, team.id]))}
                  className={cn('flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default',
                    on || auto ? 'border-danger/60 bg-danger-soft' : 'border-border hover:border-primary/40')}>
                  <span className={cn('grid size-5 shrink-0 place-items-center rounded-md border-2', on || auto ? 'border-danger bg-danger text-white' : 'border-border')}>
                    {(on || auto) && <Check className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{team.name}</span>
                  {auto && <span className="shrink-0 text-xs text-danger">{t(`dashboard.conflicts.auto.${auto}`)}</span>}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild><Button variant="ghost">{t('common.cancel')}</Button></DialogClose>
          <Button disabled={busy === 'conflicts'} onClick={save}>{busy === 'conflicts' && <Loader2 className="size-4 animate-spin" />}{t('common.save')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- Schedule ---------- */
// judges needed for a draw: one per room, the same count the backend checks
function judgesNeeded(data: TournamentDetails, presentOnly = false, addSwing = true, round?: Round) {
  const perRoom = isBP(data.format) ? 4 : 2
  if (round?.kind === 'elimination') return Math.max(1, (round.teamsInRound ?? perRoom) / perRoom)
  let n = data.teams.filter(x => !x.swing && (!presentOnly || x.checkedIn)).length
  if (n % perRoom && addSwing) n += perRoom - (n % perRoom)
  return Math.max(1, Math.ceil(n / perRoom))
}

const dayMs = 24 * 60 * 60 * 1000
function Schedule({ data, reload }: SectionProps) {
  const { t } = useTranslation()
  const { busy, run } = useAction()
  const start = new Date(`${data.startDate.slice(0, 10)}T00:00:00`)
  const days = Math.min(14, Math.max(1, Math.round((new Date(`${data.endDate.slice(0, 10)}T00:00:00`).getTime() - start.getTime()) / dayMs) + 1))
  // local calendar date of day N (formatDate takes YYYY-MM-DD)
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const dayLabel = (d: number) => `${t('tournament.day', { n: d })} · ${formatDate(ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + d - 1)), { day: 'numeric', month: 'long', weekday: 'short' })}`
  const [items, setItems] = useState<ScheduleItem[]>(() => data.schedule.map(s => ({ ...s })))
  const set = (i: number, p: Partial<ScheduleItem>) => setItems(list => list.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const add = (day: number) => {
    const last = items.filter(x => x.day === day).at(-1)
    setItems(list => [...list, { day, time: last ? last.time : '09:00', title: '' }])
  }
  const invalid = items.some(x => x.title.trim().length < 2 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time))
  const dirty = JSON.stringify(items) !== JSON.stringify(data.schedule)
  const save = async () => {
    const sorted = items.map(x => ({ ...x, title: x.title.trim() })).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time))
    if (await run('save', () => updateSchedule(data.id, sorted), t('dashboard.schedule.saved'))) { setItems(sorted); reload() }
  }

  return (
    <>
      <SectionTitle title={t('dashboard.nav.schedule')}
        action={<Button disabled={!!busy || invalid || !dirty} onClick={save}>{busy === 'save' ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{t('common.save')}</Button>} />
      <p className="-mt-3 mb-5 text-sm text-muted-foreground">{t('dashboard.schedule.hint')}</p>
      <div className="space-y-4">
        {Array.from({ length: days }, (_, k) => k + 1).map(day => (
          <Card key={day} className="p-5">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-primary">{dayLabel(day)}</h3>
            <div className="space-y-2">
              {items.map((x, i) => x.day === day && (
                // phone: time, day and delete on one line, the title below across the width; wider: one line
                <div key={i} className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-2 last:border-0 last:pb-0 sm:flex-nowrap sm:border-0 sm:pb-0">
                  <TimePicker value={x.time} onChange={v => set(i, { time: v })} className="w-28 shrink-0" aria-label={t('dashboard.schedule.time')} />
                  <Input value={x.title} maxLength={120} onChange={e => set(i, { title: e.target.value })} placeholder={t('dashboard.schedule.titlePlaceholder')}
                    aria-label={t('dashboard.schedule.title')} aria-invalid={x.title.length > 0 && x.title.trim().length < 2} className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1" />
                  {days > 1 && (
                    <Select className="w-32 shrink-0" value={String(x.day)} onValueChange={v => set(i, { day: Number(v) })} aria-label={t('dashboard.schedule.moveDay')}
                      options={Array.from({ length: days }, (_, k) => ({ value: String(k + 1), label: t('tournament.day', { n: k + 1 }) }))} />
                  )}
                  <Button variant="ghost" size="icon" className="ml-auto shrink-0 text-muted-foreground hover:text-danger sm:ml-0" onClick={() => setItems(list => list.filter((_, j) => j !== i))} aria-label={t('common.delete')}><Trash2 className="size-4" /></Button>
                </div>
              ))}
              {!items.some(x => x.day === day) && <p className="text-sm text-muted-foreground">{t('dashboard.schedule.emptyDay')}</p>}
            </div>
            <Button variant="outline" size="sm" className="mt-3" disabled={items.length >= 60} onClick={() => add(day)}><Plus className="size-4" />{t('dashboard.schedule.add')}</Button>
          </Card>
        ))}
      </div>
      {invalid && <p className="mt-3 text-sm text-danger">{t('dashboard.schedule.invalid')}</p>}
    </>
  )
}

/* ---------- Draw ---------- */
function Draw({ data, reload }: SectionProps) {
  const { t } = useTranslation()
  const roundName = useRoundName()
  const sides = useSides(data.format)
  // BP: four teams per room (OG, OO, CG, CO); swapping exchanges the government and opposition halves
  const sideList = sidesOf(data.format)
  const { busy, run } = useAction()
  const [wingsFor, setWingsFor] = useState<Debate | null>(null)
  const defaultRound = data.rounds.find(r => r.status === 'released') ?? data.rounds.find(r => r.status === 'draft') ?? data.rounds[0]
  const [roundId, setRoundId] = useState(defaultRound?.id)
  const [presentOnly, setPresentOnly] = useState(false)
  const [addSwing, setAddSwing] = useState(true)
  const [method, setMethod] = useState<DrawMethod>('power')
  // null = the default for the round (clubmates kept apart in the first rounds)
  const [protectClubs, setProtectClubs] = useState<boolean | null>(null)
  const round = data.rounds.find(r => r.id === roundId)
  if (!round) return <EmptyState title={t('common.empty')} />

  const current = data.debates.filter(d => d.roundId === round.id)
  const team = (id: string) => data.teams.find(x => x.id === id)
  const judge = (id: string) => data.judges.find(j => j.id === id)
  const editable = round.status !== 'completed'
  const rooms = [...new Set([...(data.rooms?.length ? data.rooms : DEFAULT_ROOMS), ...current.map(d => d.room)])]

  const present = data.teams.filter(x => x.checkedIn && !x.swing).length
  const protect = protectClubs ?? round.number <= CLUB_PROTECTED_ROUNDS
  const need = judgesNeeded(data, presentOnly && present > 0, addSwing, round)
  const playoff = round.kind === 'elimination'
  const fewJudges = editable && data.judges.length < need
  const noMotion = !round.motion.trim()
  const generate = async () => {
    let report: DrawReport | undefined
    const ok = await run('generate', async () => { report = (await generateDraw(round.id, { presentOnly: presentOnly && present > 0, addSwing, method, protectClubs: protect })).report }, t('dashboard.draw.generated'))
    // wishes the draw could not meet are said out loud, not hidden
    if (ok && report && (report.sameClub || report.rematches || report.judgeConflicts)) {
      toast.warning(t('dashboard.draw.compromise'), {
        description: [
          report.sameClub ? t('dashboard.draw.sameClubLeft', { count: report.sameClub }) : '',
          report.rematches ? t('dashboard.draw.rematchesLeft', { count: report.rematches }) : '',
          report.judgeConflicts ? t('dashboard.draw.conflictsLeft', { count: report.judgeConflicts }) : '',
        ].filter(Boolean).join(' '),
        duration: 10000,
      })
    }
    if (ok) reload()
  }
  const publish = async () => { if (await run('publish', () => updateRound(round.id, { status: 'released' }), t('dashboard.draw.published'))) reload() }
  const patch = async (d: Debate, p: Parameters<typeof updateDebate>[1]) => { if (await run(d.id, () => updateDebate(d.id, p))) reload() }

  return (
    <>
      <SectionTitle title={t('dashboard.nav.draw')}
        action={
          <div className="flex flex-wrap gap-2">
            <Select value={round.id} onValueChange={setRoundId} className="w-44" aria-label={t('dashboard.draw.round')}
              options={data.rounds.map(r => ({ value: r.id, label: roundName(r), hint: t(`tournament.roundStatus.${r.status}`) }))} />
            {editable && (
              <Button variant="outline" disabled={!!busy} onClick={generate}>
                {busy === 'generate' ? <Loader2 className="size-4 animate-spin" /> : <Shuffle className="size-4" />}
                {current.length ? t('dashboard.draw.regenerate') : t('dashboard.draw.generate')}
              </Button>
            )}
            {round.status === 'draft' && current.length > 0 && (
              <Button disabled={!!busy || noMotion} title={noMotion ? t('dashboard.draw.needMotion') : undefined} onClick={publish}>
                <Megaphone className="size-4" />{t('dashboard.draw.publish')}
              </Button>
            )}
          </div>
        } />
      {editable && playoff && (
        <p className="mb-4 flex items-start gap-2 rounded-2xl border border-accent bg-accent-soft px-4 py-3 text-sm">
          <Trophy className="mt-0.5 size-4 shrink-0" />{t(isBP(data.format) ? 'dashboard.draw.bracketHintBP' : 'dashboard.draw.bracketHint')}
        </p>
      )}
      {editable && !playoff && (
        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={presentOnly && present > 0} disabled={present === 0} onChange={e => setPresentOnly(e.target.checked)} />
            {t('dashboard.draw.presentOnly', { present, total: data.teams.filter(x => !x.swing).length })}
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={addSwing} onChange={e => setAddSwing(e.target.checked)} />
            {t('dashboard.draw.addSwing')}
          </label>
          <label className="flex cursor-pointer items-center gap-2" title={t('dashboard.draw.protectHint')}>
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={protect} onChange={e => setProtectClubs(e.target.checked)} />
            {t('dashboard.draw.protectClubs')}
          </label>
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="font-semibold">{t('dashboard.draw.method')}</span>
            <Select size="sm" className="w-56" value={method} onValueChange={v => setMethod(v as DrawMethod)} aria-label={t('dashboard.draw.method')}
              options={(isBP(data.format) ? (['power', 'high_low', 'random'] as const) : (['power', 'slide', 'fold', 'high_low', 'round_robin', 'random'] as const))
                .map(m => ({ value: m, label: t(`dashboard.draw.methods.${m}`) }))} />
            <span className="text-xs text-muted-foreground">{t(`dashboard.draw.methodHints.${method}`)}</span>
          </div>
        </div>
      )}
      {fewJudges && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent bg-accent-soft px-4 py-3 text-sm">
          <p className="font-medium">{t('dashboard.draw.fewJudges', { need, have: data.judges.length })}</p>
          <Button asChild size="sm" variant="outline"><Link to={`/dashboard/tournaments/${data.id}/judges`}><Gavel className="size-4" />{t('dashboard.draw.addJudges')}</Link></Button>
        </div>
      )}
      {round.status === 'draft' && current.length > 0 && noMotion && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          <p className="font-medium">{t('dashboard.draw.needMotion')}</p>
          <Button asChild size="sm" variant="outline"><Link to={`/dashboard/tournaments/${data.id}/rounds`}><Pencil className="size-4" />{t('dashboard.draw.setMotion')}</Link></Button>
        </div>
      )}
      {current.length === 0 ? (
        <EmptyState icon={<Shuffle className="size-7" />} title={t('dashboard.draw.empty')} text={t('dashboard.draw.emptyText')}
          action={editable && <Button disabled={!!busy} onClick={generate}><Shuffle className="size-4" />{t('dashboard.draw.generate')}</Button>} />
      ) : (
        <>
          {editable && <p className="mb-3 text-sm text-muted-foreground">{t('dashboard.draw.hint')}</p>}
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t('tournament.room')}</th>
                  <th className="px-4 py-3">{sides.proposition}</th>
                  <th className="w-12 px-2 py-3" />
                  {sideList.slice(1).map(side => <th key={side} className="px-4 py-3">{sides[side]}</th>)}
                  <th className="px-4 py-3">{t('tournament.judges')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {current.map(d => (
                  <tr key={d.id} className={cn(busy === d.id && 'opacity-50')}>
                    <td className="px-4 py-3">
                      <Select size="sm" className="w-36" value={d.room} disabled={!editable} aria-label={t('tournament.room')}
                        onValueChange={v => patch(d, { room: v })} options={rooms.map(r => ({ value: r, label: r }))} />
                      <OnlineLink url={d.onlineUrl} className="mt-1 text-xs" label={t('online.link')} />
                    </td>
                    <td className="px-4 py-3 font-bold">{team(d.propositionTeamId)?.name}</td>
                    <td className="px-2 py-3">
                      <Button variant="ghost" size="icon" disabled={!editable || d.ballotStatus !== 'pending'} title={t('dashboard.draw.swap')} aria-label={t('dashboard.draw.swap')}
                        onClick={() => patch(d, { swapSides: true })}>
                        <ArrowLeftRight className="size-4" />
                      </Button>
                    </td>
                    {sideList.slice(1).map(side => <td key={side} className="px-4 py-3 font-bold">{team(teamIdOn(d, side)!)?.name}</td>)}
                    <td className="px-4 py-3">
                      <Select size="sm" className="w-56" value={d.judgeIds[0]} disabled={!editable} aria-label={t('tournament.chair')}
                        onValueChange={v => patch(d, { chairJudgeId: v })}
                        options={data.judges.map(j => ({ value: j.id, label: j.name, hint: j.institution || undefined }))} />
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {d.judgeIds.length > 1 && <span>+ {d.judgeIds.slice(1).map(id => judge(id)?.name).join(', ')}</span>}
                        {d.judgeIds.some(id => { const j = judge(id); return j && sideList.some(side => conflictReason(j, team(teamIdOn(d, side) ?? ''))) }) && (
                          <span className="inline-flex items-center gap-1 font-semibold text-danger"><ShieldAlert className="size-3.5" />{t('dashboard.draw.hasConflict')}</span>
                        )}
                        {editable && d.ballotStatus === 'pending' && (
                          <button type="button" onClick={() => setWingsFor(d)} className="inline-flex cursor-pointer items-center gap-1 font-semibold text-primary hover:underline">
                            <UserPlus className="size-3.5" />{t('dashboard.draw.wings')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
      <WingsDialog debate={wingsFor} data={data} saving={!!wingsFor && busy === wingsFor.id} onClose={() => setWingsFor(null)}
        onSave={async ids => { if (await run(wingsFor!.id, () => updateDebate(wingsFor!.id, { wingJudgeIds: ids }), t('dashboard.draw.wingsSaved'))) { setWingsFor(null); reload() } }} />
    </>
  )
}

// wing judges of one debate; judges already sitting in another room of this round are unavailable
function WingsDialog({ debate, data, saving, onClose, onSave }: { debate: Debate | null; data: TournamentDetails; saving: boolean; onClose: () => void; onSave: (ids: string[]) => void }) {
  const { t } = useTranslation()
  const [sel, setSel] = useState<string[]>([])
  useEffect(() => { if (debate) setSel(debate.judgeIds.slice(1)) }, [debate])
  if (!debate) return null
  const chair = debate.judgeIds[0]
  const elsewhere = new Set(data.debates.filter(x => x.roundId === debate.roundId && x.id !== debate.id).flatMap(x => x.judgeIds))
  const toggle = (id: string) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : s.length < 4 ? [...s, id] : s))
  const team = (id: string) => data.teams.find(x => x.id === id)?.name
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent heading={t('dashboard.draw.wingsTitle')} description={`${debate.room} · ${sidesOf(data.format).map(side => team(teamIdOn(debate, side)!)).join(debate.closingPropositionTeamId ? ' · ' : ' vs ')}`}>
        <p className="text-sm text-muted-foreground">{t('dashboard.draw.wingsText')}</p>
        <ul className="mt-4 max-h-80 space-y-1.5 overflow-y-auto">
          {data.judges.filter(j => j.id !== chair).map(j => {
            const busyThere = elsewhere.has(j.id)
            const on = sel.includes(j.id)
            return (
              <li key={j.id}>
                <button type="button" disabled={busyThere} onClick={() => toggle(j.id)} aria-pressed={on}
                  className={cn('flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    on ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/40')}>
                  <span className={cn('grid size-5 shrink-0 place-items-center rounded-md border-2', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                    {on && <Check className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{j.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{busyThere ? t('dashboard.draw.busyElsewhere') : j.institution || '—'}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="mt-5 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{t('dashboard.draw.wingsCount', { count: sel.length })}</span>
          <div className="flex gap-2">
            <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button disabled={saving} onClick={() => onSave(sel)}>{saving && <Loader2 className="size-4 animate-spin" />}{t('common.save')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- Ballots ---------- */
function Ballots({ data }: SectionProps) {
  const { t } = useTranslation()
  const roundName = useRoundName()
  const active = data.rounds.filter(r => r.status !== 'draft')
  const [roundId, setRoundId] = useState(active.at(-1)?.id ?? '')
  const list = data.debates.filter(d => d.roundId === roundId)
  const done = list.filter(d => d.ballotStatus !== 'pending').length
  const variant = { pending: 'outline', submitted: 'accent', confirmed: 'success' } as const
  if (!active.length) return <><SectionTitle title={t('dashboard.nav.ballots')} /><EmptyState icon={<ClipboardList className="size-7" />} title={t('tournament.noDraw')} /></>
  return (
    <>
      <SectionTitle title={t('dashboard.nav.ballots')}
        action={<Select value={roundId} onValueChange={setRoundId} className="w-40" aria-label={t('dashboard.draw.round')} options={active.map(r => ({ value: r.id, label: roundName(r) }))} />} />
      <Card className="mb-4 p-5">
        <div className="flex justify-between text-sm font-semibold"><span>{t('dashboard.ballots.progress', { done, total: list.length })}</span><span className="text-primary">{list.length ? Math.round((done / list.length) * 100) : 0}%</span></div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-success transition-all" style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} /></div>
      </Card>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {list.map(d => (
          <Card key={d.id} className="flex items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-muted-foreground">{d.room}</p>
              <p className="truncate font-bold">{sidesOf(data.format).map(side => data.teams.find(x => x.id === teamIdOn(d, side))?.name).join(d.closingPropositionTeamId ? ' · ' : ' vs ')}</p>
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
// city, dates and team limit can change until the tournament is finished
function DetailsCard({ data, reload }: SectionProps) {
  const { t } = useTranslation()
  const { busy, run } = useAction()
  const initial = { region: data.region ?? regionOfCity(data.city)?.code ?? '', city: data.city, district: data.district ?? '', startDate: data.startDate, endDate: data.endDate, registrationDeadline: data.registrationDeadline ?? '', maxTeams: data.maxTeams }
  const [f, setF] = useState(initial)
  useEffect(() => setF(initial), [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(f) !== JSON.stringify(initial)
  const minTeams = Math.max(4, data.teams.length)
  const limitBad = !Number.isInteger(f.maxTeams) || f.maxTeams < minTeams || f.maxTeams > 128
  const today = new Date().toISOString().slice(0, 10)
  const save = async () => {
    const city = placeCity(f)
    if (!f.region || city.length < 2) return void toast.error(t('place.cityRequired'))
    if (await run('details', () => updateTournament(data.id, { ...f, city, district: f.district.trim() || null, registrationDeadline: f.registrationDeadline || null }), t('dashboard.teams.saved'))) reload()
  }
  return (
    <Card className="space-y-4 p-6">
      <div>
        <h3 className="font-bold">{t('dashboard.details.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.details.text')}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <PlacePicker value={{ region: f.region, city: f.city, district: f.district }} onChange={p => setF({ ...f, ...p })} />
        </div>
        <div>
          <Label htmlFor="d-max">{t('wizard.maxTeams')}</Label>
          <Input id="d-max" type="number" min={minTeams} max={128} value={f.maxTeams} aria-invalid={limitBad} onChange={e => setF({ ...f, maxTeams: Number(e.target.value) })} />
          {limitBad
            ? <p className="mt-1 text-xs text-danger">{t('dashboard.details.limitHint', { min: minTeams })}</p>
            : f.maxTeams > FREE_TEAM_LIMIT && data.plan !== 'pro' && <p className="mt-1 text-xs font-semibold text-accent-foreground dark:text-accent">{t('dashboard.details.becomesPro')}</p>}
        </div>
        <div>
          <Label htmlFor="d-start">{t('wizard.startDate')}</Label>
          <DatePicker id="d-start" value={f.startDate} min={data.status === 'registration' ? today : undefined}
            onChange={v => v && setF({ ...f, startDate: v, endDate: f.endDate < v ? v : f.endDate })} />
        </div>
        <div>
          <Label htmlFor="d-end">{t('wizard.endDate')}</Label>
          <DatePicker id="d-end" value={f.endDate} min={f.startDate} onChange={v => v && setF({ ...f, endDate: v })} />
        </div>
        {data.status === 'registration' && (
          <div className="sm:col-span-2">
            <Label htmlFor="d-deadline">{t('wizard.regDeadline')}</Label>
            <DatePicker id="d-deadline" value={f.registrationDeadline} max={f.startDate} onChange={v => setF({ ...f, registrationDeadline: v })} />
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        {dirty && <Button variant="ghost" onClick={() => setF(initial)}>{t('common.cancel')}</Button>}
        <Button disabled={!dirty || limitBad || busy === 'details'} onClick={save}>{busy === 'details' && <Loader2 className="size-4 animate-spin" />}{t('common.save')}</Button>
      </div>
    </Card>
  )
}

// the organizer's own rooms, used by the draw in this order
// break categories: an extra bracket for a group of teams (novices, juniors…); teams are ticked in the Teams section
function CategoriesCard({ data, reload }: SectionProps) {
  const { t } = useTranslation()
  const { busy, run } = useAction()
  const saved = data.breakCategories ?? []
  const [list, setList] = useState(saved)
  const [name, setName] = useState('')
  useEffect(() => setList(data.breakCategories ?? []), [data.breakCategories])
  const sizes = isBP(data.format) ? [4, 8, 16] : [2, 4, 8, 16]
  const dirty = JSON.stringify(list) !== JSON.stringify(saved)
  const add = () => {
    const n = name.trim()
    if (n.length < 2 || list.length >= 3) return
    setList([...list, { key: `c${Date.now().toString(36)}`, name: n, size: sizes[0] }])
    setName('')
  }
  const save = async () => { if (await run('cats', () => updateTournament(data.id, { breakCategories: list }), t('dashboard.teams.saved'))) reload() }
  return (
    <Card className="space-y-4 p-6">
      <div>
        <h3 className="flex items-center gap-2 font-bold"><Trophy className="size-4 text-primary" />{t('dashboard.categories.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.categories.text')}</p>
      </div>
      {list.length > 0 && (
        <ul className="space-y-2">
          {list.map((c, i) => (
            <li key={c.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
              <span className="text-xs text-muted-foreground">{t('dashboard.categories.size')}</span>
              <Select size="sm" className="w-24" value={String(c.size)} aria-label={`${c.name}: ${t('dashboard.categories.size')}`}
                onValueChange={v => setList(list.map((x, j) => (j === i ? { ...x, size: Number(v) } : x)))} options={sizes.map(n => ({ value: String(n), label: String(n) }))} />
              <button type="button" aria-label={t('common.delete')} onClick={() => setList(list.filter((_, j) => j !== i))}
                className="grid size-8 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-danger-soft hover:text-danger"><X className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}
      {list.length < 3 && (
        <div className="flex gap-2">
          <Input value={name} maxLength={40} placeholder={t('dashboard.categories.placeholder')} aria-label={t('dashboard.categories.placeholder')}
            onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
          <Button variant="outline" disabled={name.trim().length < 2} onClick={add}><Plus className="size-4" />{t('dashboard.rooms.add')}</Button>
        </div>
      )}
      <div className="flex justify-end gap-2">
        {dirty && <Button variant="ghost" onClick={() => setList(saved)}>{t('common.cancel')}</Button>}
        <Button disabled={!dirty || busy === 'cats'} onClick={save}>{t('common.save')}</Button>
      </div>
    </Card>
  )
}

function RoomsCard({ data, reload }: SectionProps) {
  const { t } = useTranslation()
  const { busy, run } = useAction()
  const saved = data.rooms ?? []
  const savedLinks = data.roomLinks ?? {}
  const [rooms, setRooms] = useState(saved)
  // online tournaments: a video call link per room (optional, https)
  const [links, setLinks] = useState<Record<string, string>>(savedLinks)
  const [draft, setDraft] = useState('')
  useEffect(() => setRooms(data.rooms ?? []), [data.rooms])
  useEffect(() => setLinks(data.roomLinks ?? {}), [data.roomLinks])
  const cleanLinks: Record<string, string> = Object.fromEntries(rooms.map(r => [r, (links[r] ?? '').trim()] as const).filter(([, v]) => v))
  const badLink = Object.values(cleanLinks).some(v => !/^https:\/\/\S+\.\S+/.test(v))
  const dirty = JSON.stringify(rooms) !== JSON.stringify(saved) || JSON.stringify(cleanLinks) !== JSON.stringify(savedLinks)
  const needed = Math.ceil(data.maxTeams / 2)
  const add = () => {
    const v = draft.trim()
    if (v && !rooms.includes(v) && rooms.length < 64) setRooms([...rooms, v])
    setDraft('')
  }
  const save = async () => { if (await run('rooms', () => updateTournament(data.id, { rooms, roomLinks: cleanLinks }), t('dashboard.rooms.saved'))) reload() }
  return (
    <Card className="space-y-4 p-6">
      <div>
        <h3 className="flex items-center gap-2 font-bold"><DoorOpen className="size-4 text-primary" />{t('dashboard.rooms.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.rooms.text')}</p>
      </div>
      {rooms.length === 0
        ? <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">{t('dashboard.rooms.empty')}</p>
        : (
          <ul className="space-y-2">
            {rooms.map((r, i) => (
              <li key={r} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-2 text-sm sm:flex-nowrap">
                <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate font-medium sm:w-40 sm:flex-none">{r}</span>
                <Input className="h-9 min-w-0 flex-[2] basis-full text-sm sm:basis-auto" inputMode="url" value={links[r] ?? ''} maxLength={300}
                  placeholder={t('dashboard.rooms.linkPlaceholder')} aria-label={`${r}: ${t('dashboard.rooms.linkPlaceholder')}`}
                  aria-invalid={!!links[r]?.trim() && !/^https:\/\/\S+\.\S+/.test(links[r].trim())}
                  onChange={e => setLinks({ ...links, [r]: e.target.value })} />
                <button type="button" aria-label={t('common.delete')} onClick={() => setRooms(rooms.filter(x => x !== r))}
                  className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-danger-soft hover:text-danger">
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      <div className="flex gap-2">
        <Input value={draft} maxLength={60} placeholder={t('dashboard.rooms.placeholder')} aria-label={t('dashboard.rooms.placeholder')}
          onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <Button variant="outline" disabled={!draft.trim()} onClick={add}><Plus className="size-4" />{t('dashboard.rooms.add')}</Button>
      </div>
      {rooms.length > 0 && rooms.length < needed && <p className="text-xs text-muted-foreground">{t('dashboard.rooms.need', { count: needed })}</p>}
      <p className={cn('text-xs', badLink ? 'text-danger' : 'text-muted-foreground')}>{t(badLink ? 'dashboard.rooms.linkInvalid' : 'dashboard.rooms.linkHint')}</p>
      <div className="flex justify-end gap-2">
        {dirty && <Button variant="ghost" onClick={() => { setRooms(saved); setLinks(savedLinks) }}>{t('common.cancel')}</Button>}
        <Button disabled={!dirty || badLink || busy === 'rooms'} onClick={save}>{t('common.save')}</Button>
      </div>
    </Card>
  )
}

function SettingsSection({ data, reload }: SectionProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { busy, run } = useAction()
  const [form, setForm] = useState({ name: data.name, description: data.description, visible: data.visible ?? true })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [stageTo, setStageTo] = useState<TournamentStatus | null>(null)
  const changeStage = async () => {
    if (await run('stage', () => updateTournament(data.id, { status: stageTo! }), t('dashboard.stage.changed'))) { setStageTo(null); reload() }
  }
  const toggleRegistration = async (open: boolean) => {
    if (await run('reg', () => updateTournament(data.id, { registrationOpen: open }), open ? t('dashboard.stage.regOpened') : t('dashboard.stage.regClosed'))) reload()
  }
  const stages: TournamentStatus[] = ['registration', 'ongoing', 'finished']
  const stageIndex = stages.indexOf(data.status)
  const next = stages[stageIndex + 1]
  // deleting and inviting co-organizers is for the owner (or a platform admin)
  const isOwner = data.myRole === 'owner' || data.myRole === 'admin'
  const save = async () => { if (await run('save', () => updateTournament(data.id, form), t('dashboard.teams.saved'))) reload() }
  const remove = async () => {
    if (await run('delete', () => deleteTournament(data.id), t('dashboard.settings.deleted'))) navigate('/dashboard', { replace: true })
  }
  return (
    <>
      <SectionTitle title={t('dashboard.nav.settings')} />
      <div className="space-y-5">
        <Card className="p-6">
          <h3 className="font-bold">{t('dashboard.stage.title')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.stage.text')}</p>
          {/* stepper: registration -> ongoing -> finished */}
          <ol className="mt-5 grid grid-cols-3 gap-2">
            {stages.map((s, i) => (
              <li key={s} className={cn('flex items-center justify-center rounded-xl border-2 px-3 py-2.5 text-center text-sm font-semibold leading-tight',
                i === stageIndex ? 'border-primary bg-primary-soft text-primary' : i < stageIndex ? 'border-success/40 text-success' : 'border-border text-muted-foreground')}>
                {i < stageIndex && <Check className="mr-1 inline size-4" />}{t(`status.${s}`)}
              </li>
            ))}
          </ol>
          {data.status === 'registration' && (
            <div className="mt-5 border-t border-border pt-5">
              <Switch label={t('dashboard.stage.regSwitch')} checked={data.registrationOpen ?? true} onChange={toggleRegistration} />
            </div>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {data.status === 'ongoing' && !data.rounds.some(r => r.status !== 'draft') && (
              <Button variant="ghost" disabled={!!busy} onClick={() => setStageTo('registration')}><Undo2 className="size-4" />{t('dashboard.stage.back')}</Button>
            )}
            {next && (
              <Button variant={next === 'finished' ? 'accent' : 'primary'} disabled={!!busy || data.moderation !== 'approved'} onClick={() => setStageTo(next)}
                title={data.moderation !== 'approved' ? t('apiErrors.not_approved') : undefined}>
                {next === 'finished' ? <Flag className="size-4" /> : <Play className="size-4" />}{t(`dashboard.stage.to.${next}`)}
              </Button>
            )}
          </div>
        </Card>
        {data.status !== 'finished' && <DetailsCard data={data} reload={reload} />}
        <Card className="space-y-4 p-6">
          <h3 className="font-bold">{t('dashboard.settings.general')}</h3>
          <div><Label htmlFor="s-name">{t('wizard.name')}</Label><Input id="s-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label htmlFor="s-desc">{t('wizard.description')}</Label><Textarea id="s-desc" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <Switch label={t('dashboard.settings.visibility')} checked={form.visible} onChange={v => setForm({ ...form, visible: v })} />
          <div className="flex justify-end"><Button disabled={busy === 'save' || form.name.trim().length < 3} onClick={save}>{t('common.save')}</Button></div>
        </Card>
        <CoverCard tournamentId={data.id} cover={data.cover} onChanged={reload} />
        {data.status !== 'finished' && <RoomsCard data={data} reload={reload} />}
        {data.status !== 'finished' && !data.rounds.some(r => r.kind === 'elimination') && <CategoriesCard data={data} reload={reload} />}
        {/* Pro (more than 20 teams): Kaspi QR payment; otherwise a short note about the free plan */}
        {data.plan === 'pro' ? <PaymentCard tournamentId={data.id} /> : (
          <Card className="flex items-center justify-between gap-4 p-6">
            <div>
              <h3 className="font-bold">{t('dashboard.settings.plan')}</h3>
              <p className="text-sm text-muted-foreground">{t('dashboard.settings.planFree')}</p>
            </div>
            <Button asChild variant="outline"><Link to="/pricing">{t('nav.pricing')}</Link></Button>
          </Card>
        )}
        {isOwner && (
          <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <h3 className="font-bold">{t('dashboard.settings.coOrganizers')}</h3>
              <p className="text-sm text-muted-foreground">{t('dashboard.settings.coOrganizersText')}</p>
            </div>
            <InviteButton tournamentId={data.id} kind="co_organizer" />
            <div className="w-full"><EmailInvites tournamentId={data.id} kind="co_organizer" plain /></div>
          </Card>
        )}
        {isOwner && (
          <Card className="border-danger/40 p-6">
            <h3 className="font-bold text-danger">{t('dashboard.settings.danger')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.settings.dangerText')}</p>
            <Button variant="danger" className="mt-4" onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" />{t('dashboard.settings.deleteTournament')}</Button>
          </Card>
        )}
      </div>
      <Dialog open={!!stageTo} onOpenChange={o => !o && setStageTo(null)}>
        <DialogContent heading={stageTo ? t(`dashboard.stage.to.${stageTo}`) : ''} description={stageTo ? t(`dashboard.stage.confirm.${stageTo}`) : ''}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button disabled={busy === 'stage'} onClick={changeStage}>{busy === 'stage' && <Loader2 className="size-4 animate-spin" />}{t('common.confirm')}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent heading={t('dashboard.settings.deleteConfirm', { name: data.name })} description={t('dashboard.settings.dangerText')}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button variant="danger" disabled={busy === 'delete'} onClick={remove}><Trash2 className="size-4" />{t('common.delete')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function ManageTournament() {
  const { id = '', section = 'overview' } = useParams()
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => getTournamentById(id), [id])

  if (error instanceof NotFoundError) return <NotFound />
  if (error) return <div className="p-10"><ErrorState onRetry={reload} /></div>
  if (loading && !data) {
    return <div className="mx-auto grid max-w-[90rem] gap-6 px-4 py-8 sm:px-6 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>
  }
  if (!data) return null

  const current = (sections.some(s => s.key === section) ? section : 'overview') as Section
  const props = { data, reload }

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 sm:py-8">
      {/* the sections change the address, so "back" is a fixed place: the organizer's list, or the admin panel for an admin */}
      {data.myRole === 'admin'
        ? <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />{t('cabinet.admin')}</Link>
        : <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />{t('dashboard.myTournaments')}</Link>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{data.name}</h1>
        <Badge variant="glass" className="border border-border"><StatusDot status={data.status} />{t(`status.${data.status}`)}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{formatDateRange(data.startDate, data.endDate)} · {data.city}</p>
      <ModerationBanner status={data.moderation} note={data.moderationNote} className="mt-4" />

      <div className="mt-6 grid gap-6 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:block lg:space-y-1 lg:px-0">
          <div className="contents lg:block lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-2">
            {sections.map(({ key, icon: Icon }) => (
              <NavLink key={key} to={`/dashboard/tournaments/${id}${key === 'overview' ? '' : `/${key}`}`} end
                className={cn('flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
                  current === key ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <Icon className="size-4" />{t(`dashboard.nav.${key}`)}
                {key === 'registrations' && !!data.pendingRegistrations && (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-navy" aria-label={t('dashboard.pendingCount', { count: data.pendingRegistrations })}>
                    {data.pendingRegistrations}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
          <Link to={`/tournaments/${id}`} className="flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-primary hover:underline lg:px-3.5 lg:pb-0 lg:pt-4 lg:text-xs">
            <ExternalLink className="size-3.5" />{t('dashboard.public')}
          </Link>
        </nav>

        <section className={cn('min-w-0 transition-opacity', loading && 'opacity-60')}>
          {current === 'overview' && <Overview {...props} />}
          {current === 'registrations' && <Registrations {...props} />}
          {current === 'teams' && <Teams {...props} />}
          {current === 'judges' && <Judges {...props} />}
          {current === 'schedule' && <Schedule {...props} />}
          {current === 'rounds' && <Rounds {...props} />}
          {current === 'draw' && <Draw {...props} />}
          {current === 'ballots' && <Ballots {...props} />}
          {current === 'results' && (
            <>
              <SectionTitle title={t('dashboard.nav.results')}
                action={data.status === 'finished' && (
                  <Button asChild variant="outline"><a href={`/tournaments/${id}/certificates/print`} target="_blank" rel="noopener"><Award className="size-4" />{t('certificate.printAll')}</a></Button>
                )} />
              {data.status !== 'finished' && <p className="-mt-3 mb-4 text-sm text-muted-foreground">{t('certificate.afterFinish')}</p>}
              <ResultsTab id={id} kind="teams" tournament={data} />
            </>
          )}
          {current === 'settings' && <SettingsSection {...props} />}
        </section>
      </div>
    </div>
  )
}
