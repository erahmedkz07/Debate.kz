import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  ArrowLeft, ArrowLeftRight, BarChart3, Check, CheckCircle2, ClipboardList, ExternalLink, Flag, Gavel, Inbox, LayoutDashboard, ListOrdered,
  AlertTriangle, DoorOpen, Loader2, Megaphone, MessageSquare, Pencil, Play, Plus, Settings, Shuffle, Trash2, Undo2, UserPlus, Users, X,
} from 'lucide-react'
import {
  addJudge, addTeam, deleteJudge, deleteTeam, deleteTournament, generateDraw, getCities, getJudgeFeedback, getRegistrations, reviewJudge, getTournamentById, NotFoundError, setRegistrationStatus,
  updateDebate, updateRound, updateTeam, updateTournament, type TeamInput,
} from '@/api'
import type { Debate, Judge, JudgeFeedbackRow, Round, Team, TournamentDetails, TournamentStatus } from '@/types'
import { LevelBadge } from '@/components/judge/LevelBadge'
import { StarRating } from '@/components/ui/stars'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { cn, formatDateRange, initials } from '@/lib/utils'
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
import { ModerationBanner } from '@/components/tournament/ModerationBadge'
import { DatePicker } from '@/components/ui/date-picker'

const sections = [
  { key: 'overview', icon: LayoutDashboard },
  { key: 'registrations', icon: Inbox },
  { key: 'teams', icon: Users },
  { key: 'judges', icon: Gavel },
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
  const steps = [
    { text: t('dashboard.overview.checklist1'), done: data.teams.length >= 2 },
    { text: t('dashboard.overview.checklist2'), done: data.judges.length * 2 >= data.teams.length },
    { text: t('dashboard.overview.checklist3'), done: !nextRound || data.debates.some(d => d.roundId === nextRound.id) },
    { text: t('dashboard.overview.checklist4'), done: !nextRound || nextRound.status !== 'draft' },
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
        <h3 className="text-lg font-bold">{t('dashboard.overview.next')}{nextRound && <span className="font-normal text-muted-foreground"> · {nextRound.name}</span>}</h3>
        <ul className="mt-4 space-y-2">
          {steps.map(s => (
            <li key={s.text} className="flex items-center gap-3 rounded-xl p-3 text-sm font-medium">
              <CheckCircle2 className={cn('size-5 shrink-0', s.done ? 'text-success' : 'text-border')} fill={s.done ? 'currentColor' : 'none'} stroke={s.done ? 'white' : 'currentColor'} />
              <span className={cn(s.done && 'text-muted-foreground line-through')}>{s.text}</span>
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
  const decide = async (id: string, status: 'confirmed' | 'rejected') => {
    if (await run(id, () => setRegistrationStatus(id, status), t(`dashboard.registrations.${status}Toast`))) {
      regs.reload()
      reload()
    }
  }
  const variant = { pending: 'accent', confirmed: 'success', rejected: 'danger' } as const
  return (
    <>
      <SectionTitle title={t('dashboard.nav.registrations')} />
      {regs.error ? <ErrorState onRetry={regs.reload} /> : !regs.data ? <Skeleton className="h-48" /> : regs.data.length === 0 ? (
        <EmptyState icon={<Inbox className="size-7" />} title={t('dashboard.registrations.empty')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {regs.data.map(r => (
            <Card key={r.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{r.teamName}</p>
                  <p className="text-sm text-muted-foreground">{r.institution}</p>
                </div>
                <Badge variant={variant[r.status]}>{t(`profile.regStatus.${r.status}`)}</Badge>
              </div>
              <p className="mt-3 text-sm">{r.speakers.join(', ')}</p>
              <p className="mt-2 text-xs text-muted-foreground">{r.user.name} · {r.user.email} · {r.contactPhone}</p>
              {r.status === 'pending' && (
                <div className="mt-4 flex gap-2">
                  <Button size="sm" disabled={!!busy} onClick={() => decide(r.id, 'confirmed')}>
                    {busy === r.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{t('dashboard.registrations.confirm')}
                  </Button>
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
function TeamDialog({ team, open, onOpenChange, onSave, saving }: { team: Team | null; open: boolean; onOpenChange: (v: boolean) => void; onSave: (t: TeamInput) => void; saving: boolean }) {
  const { t } = useTranslation()
  const empty: TeamInput = { name: '', institution: '', speakers: ['', '', ''] }
  const [form, setForm] = useState<TeamInput>(empty)
  useEffect(() => {
    if (open) setForm(team ? { name: team.name, institution: team.institution, speakers: team.speakers.map(s => s.name) } : empty)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const valid = form.name.trim().length >= 2 && form.institution.trim().length >= 2 && form.speakers.every(s => s.trim().length >= 3)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent heading={team ? t('dashboard.teams.editTitle') : t('dashboard.teams.addTitle')}>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (valid) onSave(form) }}>
          <div className="grid gap-4 sm:grid-cols-2">
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
      <SectionTitle title={`${t('dashboard.nav.teams')} · ${data.teams.length}/${data.maxTeams}`}
        action={<Button disabled={data.teams.length >= data.maxTeams} onClick={() => { setEditing(null); setOpen(true) }}><Plus className="size-4" />{t('dashboard.teams.add')}</Button>} />
      {data.teams.length === 0 ? <EmptyState icon={<Users className="size-7" />} title={t('common.empty')} /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-5 py-3">{t('common.team')}</th><th className="px-5 py-3">{t('tournament.speakers')}</th><th className="w-28 px-5 py-3" /></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.teams.map(team => (
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
      )}
      <TeamDialog team={editing} open={open} onOpenChange={setOpen} onSave={save} saving={busy === 'save'} />
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
// team feedback about one judge (organizers only) and the organizer's own rating
function JudgeFeedbackDialog({ judge, row, onClose, onReviewed }: { judge: Judge | null; row?: JudgeFeedbackRow; onClose: () => void; onReviewed: () => void }) {
  const { t } = useTranslation()
  const { busy, run } = useAction()
  if (!judge) return null
  const review = async (score: number) => { if (await run('review', () => reviewJudge(judge.id, score), t('dashboard.judges.reviewSaved'))) onReviewed() }
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent heading={judge.name} description={t('dashboard.judges.feedbackTitle')}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/60 p-4">
          <div>
            <p className="text-sm font-semibold">{t('dashboard.judges.yourReview')}</p>
            <p className="text-xs text-muted-foreground">{row?.debates ? t('dashboard.judges.reviewHint') : t('dashboard.judges.reviewLater')}</p>
          </div>
          {row?.debates ? <StarRating label={t('dashboard.judges.yourReview')} value={row.review ?? 0} onChange={v => busy !== 'review' && review(v)} /> : null}
        </div>
        {!row?.items.length ? <p className="mt-4 text-sm text-muted-foreground">{t('dashboard.judges.noFeedback')}</p> : (
          <ul className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
            {row.items.map((f, i) => (
              <li key={i} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StarRating size="sm" label={t('feedback.score')} value={f.score} />
                  <span className="font-semibold text-foreground">{f.team}</span>
                  <Badge variant={f.teamWon ? 'success' : 'danger'}>{t(f.teamWon ? 'profile.result.win' : 'profile.result.loss')}</Badge>
                  <span>{f.round}</span>
                </div>
                {f.comment && <p className="mt-2 text-sm">{f.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Judges({ data, reload }: SectionProps) {
  const { t } = useTranslation()
  const { busy, run } = useAction()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', institution: '', rating: 7 })
  const [toDelete, setToDelete] = useState<Judge | null>(null)
  const [feedbackOf, setFeedbackOf] = useState<Judge | null>(null)
  const feedback = useAsync(() => getJudgeFeedback(data.id), [data.id, data.judges.length])
  const rowOf = (id: string) => feedback.data?.find(r => r.judgeId === id)
  const remove = async () => {
    if (await run('delete', () => deleteJudge(toDelete!.id), t('dashboard.judges.deleted'))) { setToDelete(null); reload() }
  }
  const submit = async () => {
    if (form.name.trim().length < 3) return
    const ok = await run('add', () => addJudge(data.id, { name: form.name, institution: form.institution || undefined, rating: form.rating }), t('dashboard.teams.saved'))
    if (ok) { setForm({ name: '', institution: '', rating: 7 }); setOpen(false); reload() }
  }
  return (
    <>
      <SectionTitle title={`${t('dashboard.nav.judges')} · ${data.judges.length}`}
        action={
          <div className="flex flex-wrap gap-2">
            <InviteButton tournamentId={data.id} kind="judge" variant="primary" />
            <Button variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" />{t('dashboard.judges.add')}</Button>
          </div>
        } />
      <p className="-mt-3 mb-5 text-sm text-muted-foreground">{t('dashboard.judges.inviteHint')}</p>
      {data.judges.length === 0 && <EmptyState icon={<Gavel className="size-7" />} title={t('dashboard.judges.empty')} text={t('dashboard.judges.emptyText')} />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.judges.map(j => {
          const row = rowOf(j.id)
          return (
          <Card key={j.id} className="p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">{initials(j.name)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold" title={j.name}>{j.name}</p>
                <p className="truncate text-xs text-muted-foreground">{j.institution || '—'}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <LevelBadge level={j.level} />
                  {row && row.feedbackCount > 0 && <span className="text-xs text-muted-foreground">★ {row.feedbackAvg?.toFixed(1)} · {t('dashboard.judges.feedbackCount', { count: row.feedbackCount })}</span>}
                </div>
              </div>
            </div>
            {/* organizer's rating and actions on their own row so long names are not cut */}
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">{t('tournament.rating')} <b className="text-sm font-extrabold text-primary">{j.rating}/10</b></p>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setFeedbackOf(j)}>
                  <MessageSquare className="size-4" />{t('dashboard.judges.feedbackShort')}
                </Button>
                <Button variant="ghost" size="icon" aria-label={t('common.delete')} title={t('common.delete')} className="size-9 hover:text-danger" onClick={() => setToDelete(j)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </Card>
          )
        })}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent heading={t('dashboard.judges.addTitle')}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); submit() }}>
            <div><Label htmlFor="jn">{t('auth.name')}</Label><Input id="jn" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label htmlFor="ji">{t('common.institution')}</Label><Input id="ji" value={form.institution} onChange={e => setForm({ ...form, institution: e.target.value })} /></div>
            <div>
              <Label htmlFor="jr">{t('tournament.rating')}: <b className="text-primary">{form.rating}</b></Label>
              <input id="jr" type="range" min={1} max={10} value={form.rating} onChange={e => setForm({ ...form, rating: Number(e.target.value) })} className="w-full accent-[var(--primary)]" />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
              <Button type="submit" disabled={busy === 'add' || form.name.trim().length < 3}>{t('common.save')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <JudgeFeedbackDialog judge={feedbackOf} row={feedbackOf ? rowOf(feedbackOf.id) : undefined} onClose={() => setFeedbackOf(null)} onReviewed={feedback.reload} />
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
  const { busy, run } = useAction()
  const [motion, setMotion] = useState(round.motion)
  useEffect(() => setMotion(round.motion), [round.motion])
  const dirty = motion.trim() !== round.motion

  const save = async () => { if (await run('save', () => updateRound(round.id, { motion }), t('dashboard.teams.saved'))) reload() }
  const release = async () => {
    if (await run('release', () => updateRound(round.id, { motion, status: 'released' }), t('dashboard.rounds.released'))) reload()
  }
  const complete = async () => { if (await run('complete', () => updateRound(round.id, { status: 'completed' }), t('dashboard.rounds.completedToast'))) reload() }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">{round.number}</span>
          <p className="font-bold">{round.name}</p>
          <Badge variant={round.status === 'completed' ? 'muted' : round.status === 'released' ? 'accent' : 'outline'}>{t(`tournament.roundStatus.${round.status}`)}</Badge>
        </div>
        <div className="flex gap-2">
          {dirty && round.status !== 'completed' && <Button size="sm" variant="outline" disabled={!!busy} onClick={save}>{t('common.save')}</Button>}
          {round.status === 'draft' && (
            <Button size="sm" disabled={!!busy || !motion.trim() || !hasDraw} title={!hasDraw ? t('dashboard.rounds.needDraw') : undefined} onClick={release}>
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
        {round.status === 'draft' && !hasDraw && <p className="mt-2 text-xs text-muted-foreground">{t('dashboard.rounds.needDraw')}</p>}
      </div>
    </Card>
  )
}

function Rounds({ data, reload }: SectionProps) {
  const { t } = useTranslation()
  return (
    <>
      <SectionTitle title={t('dashboard.nav.rounds')} />
      <div className="space-y-4">
        {data.rounds.map(r => <RoundCard key={r.id} round={r} hasDraw={data.debates.some(d => d.roundId === r.id)} reload={reload} />)}
      </div>
    </>
  )
}

/* ---------- Draw ---------- */
function Draw({ data, reload }: SectionProps) {
  const { t } = useTranslation()
  const { busy, run } = useAction()
  const [wingsFor, setWingsFor] = useState<Debate | null>(null)
  const defaultRound = data.rounds.find(r => r.status === 'released') ?? data.rounds.find(r => r.status === 'draft') ?? data.rounds[0]
  const [roundId, setRoundId] = useState(defaultRound?.id)
  const round = data.rounds.find(r => r.id === roundId)
  if (!round) return <EmptyState title={t('common.empty')} />

  const current = data.debates.filter(d => d.roundId === round.id)
  const team = (id: string) => data.teams.find(x => x.id === id)
  const judge = (id: string) => data.judges.find(j => j.id === id)
  const editable = round.status !== 'completed'
  const rooms = [...new Set([...(data.rooms?.length ? data.rooms : DEFAULT_ROOMS), ...current.map(d => d.room)])]

  const generate = async () => { if (await run('generate', () => generateDraw(round.id), t('dashboard.draw.generated'))) reload() }
  const publish = async () => { if (await run('publish', () => updateRound(round.id, { status: 'released' }), t('dashboard.draw.published'))) reload() }
  const patch = async (d: Debate, p: Parameters<typeof updateDebate>[1]) => { if (await run(d.id, () => updateDebate(d.id, p))) reload() }

  return (
    <>
      <SectionTitle title={t('dashboard.nav.draw')}
        action={
          <div className="flex flex-wrap gap-2">
            <Select value={round.id} onValueChange={setRoundId} className="w-44" aria-label={t('dashboard.draw.round')}
              options={data.rounds.map(r => ({ value: r.id, label: r.name, hint: t(`tournament.roundStatus.${r.status}`) }))} />
            {editable && (
              <Button variant="outline" disabled={!!busy} onClick={generate}>
                {busy === 'generate' ? <Loader2 className="size-4 animate-spin" /> : <Shuffle className="size-4" />}
                {current.length ? t('dashboard.draw.regenerate') : t('dashboard.draw.generate')}
              </Button>
            )}
            {round.status === 'draft' && current.length > 0 && (
              <Button disabled={!!busy || !round.motion.trim()} title={!round.motion.trim() ? t('dashboard.draw.needMotion') : undefined} onClick={publish}>
                <Megaphone className="size-4" />{t('dashboard.draw.publish')}
              </Button>
            )}
          </div>
        } />
      {round.status === 'draft' && current.length > 0 && !round.motion.trim() && <p className="mb-3 text-sm text-danger">{t('dashboard.draw.needMotion')}</p>}
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
                  <th className="px-4 py-3">{t('tournament.proposition')}</th>
                  <th className="w-12 px-2 py-3" />
                  <th className="px-4 py-3">{t('tournament.opposition')}</th>
                  <th className="px-4 py-3">{t('tournament.judges')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {current.map(d => (
                  <tr key={d.id} className={cn(busy === d.id && 'opacity-50')}>
                    <td className="px-4 py-3">
                      <Select size="sm" className="w-36" value={d.room} disabled={!editable} aria-label={t('tournament.room')}
                        onValueChange={v => patch(d, { room: v })} options={rooms.map(r => ({ value: r, label: r }))} />
                    </td>
                    <td className="px-4 py-3 font-bold">{team(d.propositionTeamId)?.name}</td>
                    <td className="px-2 py-3">
                      <Button variant="ghost" size="icon" disabled={!editable || d.ballotStatus !== 'pending'} title={t('dashboard.draw.swap')} aria-label={t('dashboard.draw.swap')}
                        onClick={() => patch(d, { swapSides: true })}>
                        <ArrowLeftRight className="size-4" />
                      </Button>
                    </td>
                    <td className="px-4 py-3 font-bold">{team(d.oppositionTeamId)?.name}</td>
                    <td className="px-4 py-3">
                      <Select size="sm" className="w-56" value={d.judgeIds[0]} disabled={!editable} aria-label={t('tournament.chair')}
                        onValueChange={v => patch(d, { chairJudgeId: v })}
                        options={data.judges.map(j => ({ value: j.id, label: j.name, hint: [j.level && t(`judgeLevel.${j.level}`), `${j.rating}/10`].filter(Boolean).join(' · ') }))} />
                      {judge(d.judgeIds[0])?.level === 'novice' && (
                        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-accent-foreground dark:text-accent"><AlertTriangle className="size-3.5" />{t('dashboard.draw.noviceChair')}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {d.judgeIds.length > 1 && <span>+ {d.judgeIds.slice(1).map(id => judge(id)?.name).join(', ')}</span>}
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
      <DialogContent heading={t('dashboard.draw.wingsTitle')} description={`${debate.room} · ${team(debate.propositionTeamId)} vs ${team(debate.oppositionTeamId)}`}>
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
                  <span className="text-xs font-bold text-primary">{j.rating}/10</span>
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
  const active = data.rounds.filter(r => r.status !== 'draft')
  const [roundId, setRoundId] = useState(active.at(-1)?.id ?? '')
  const list = data.debates.filter(d => d.roundId === roundId)
  const done = list.filter(d => d.ballotStatus !== 'pending').length
  const variant = { pending: 'outline', submitted: 'accent', confirmed: 'success' } as const
  if (!active.length) return <><SectionTitle title={t('dashboard.nav.ballots')} /><EmptyState icon={<ClipboardList className="size-7" />} title={t('tournament.noDraw')} /></>
  return (
    <>
      <SectionTitle title={t('dashboard.nav.ballots')}
        action={<Select value={roundId} onValueChange={setRoundId} className="w-40" aria-label={t('dashboard.draw.round')} options={active.map(r => ({ value: r.id, label: r.name }))} />} />
      <Card className="mb-4 p-5">
        <div className="flex justify-between text-sm font-semibold"><span>{t('dashboard.ballots.progress', { done, total: list.length })}</span><span className="text-primary">{list.length ? Math.round((done / list.length) * 100) : 0}%</span></div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-success transition-all" style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} /></div>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map(d => (
          <Card key={d.id} className="flex items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-muted-foreground">{d.room}</p>
              <p className="truncate font-bold">{data.teams.find(x => x.id === d.propositionTeamId)?.name} <span className="text-muted-foreground">vs</span> {data.teams.find(x => x.id === d.oppositionTeamId)?.name}</p>
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
  const { data: cities = [] } = useAsync(getCities)
  const initial = { city: data.city, startDate: data.startDate, endDate: data.endDate, registrationDeadline: data.registrationDeadline ?? '', maxTeams: data.maxTeams }
  const [f, setF] = useState(initial)
  useEffect(() => setF(initial), [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(f) !== JSON.stringify(initial)
  const minTeams = Math.max(4, data.teams.length)
  const limitBad = !Number.isInteger(f.maxTeams) || f.maxTeams < minTeams || f.maxTeams > 128
  const today = new Date().toISOString().slice(0, 10)
  const save = async () => {
    if (await run('details', () => updateTournament(data.id, { ...f, registrationDeadline: f.registrationDeadline || null }), t('dashboard.teams.saved'))) reload()
  }
  return (
    <Card className="space-y-4 p-6">
      <div>
        <h3 className="font-bold">{t('dashboard.details.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.details.text')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="d-city">{t('wizard.city')}</Label>
          <Select id="d-city" value={f.city} onValueChange={c => setF({ ...f, city: c })} options={[...new Set([f.city, ...cities])].map(c => ({ value: c, label: c }))} />
        </div>
        <div>
          <Label htmlFor="d-max">{t('wizard.maxTeams')}</Label>
          <Input id="d-max" type="number" min={minTeams} max={128} value={f.maxTeams} aria-invalid={limitBad} onChange={e => setF({ ...f, maxTeams: Number(e.target.value) })} />
          {limitBad
            ? <p className="mt-1 text-xs text-danger">{t('dashboard.details.limitHint', { min: minTeams })}</p>
            : f.maxTeams > 12 && data.plan !== 'pro' && <p className="mt-1 text-xs font-semibold text-accent-foreground dark:text-accent">{t('dashboard.details.becomesPro')}</p>}
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
function RoomsCard({ data, reload }: SectionProps) {
  const { t } = useTranslation()
  const { busy, run } = useAction()
  const saved = data.rooms ?? []
  const [rooms, setRooms] = useState(saved)
  const [draft, setDraft] = useState('')
  useEffect(() => setRooms(data.rooms ?? []), [data.rooms])
  const dirty = JSON.stringify(rooms) !== JSON.stringify(saved)
  const needed = Math.ceil(data.maxTeams / 2)
  const add = () => {
    const v = draft.trim()
    if (v && !rooms.includes(v) && rooms.length < 64) setRooms([...rooms, v])
    setDraft('')
  }
  const save = async () => { if (await run('rooms', () => updateTournament(data.id, { rooms }), t('dashboard.rooms.saved'))) reload() }
  return (
    <Card className="space-y-4 p-6">
      <div>
        <h3 className="flex items-center gap-2 font-bold"><DoorOpen className="size-4 text-primary" />{t('dashboard.rooms.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.rooms.text')}</p>
      </div>
      {rooms.length === 0
        ? <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">{t('dashboard.rooms.empty')}</p>
        : (
          <ul className="flex flex-wrap gap-2">
            {rooms.map((r, i) => (
              <li key={r} className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-1 pl-3 pr-1 text-sm font-medium">
                <span className="text-xs text-muted-foreground">{i + 1}.</span>{r}
                <button type="button" aria-label={t('common.delete')} onClick={() => setRooms(rooms.filter(x => x !== r))}
                  className="grid size-6 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-danger-soft hover:text-danger">
                  <X className="size-3.5" />
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
      <div className="flex justify-end gap-2">
        {dirty && <Button variant="ghost" onClick={() => setRooms(saved)}>{t('common.cancel')}</Button>}
        <Button disabled={!dirty || busy === 'rooms'} onClick={save}>{t('common.save')}</Button>
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
        {data.status !== 'finished' && <RoomsCard data={data} reload={reload} />}
        <Card className="flex items-center justify-between gap-4 p-6">
          <div>
            <h3 className="font-bold">{t('dashboard.settings.plan')}</h3>
            <p className="text-sm text-muted-foreground">{data.maxTeams > 12 ? t('dashboard.settings.planPro') : t('dashboard.settings.planFree')}</p>
          </div>
          <Button asChild variant="outline"><Link to="/pricing">{t('nav.pricing')}</Link></Button>
        </Card>
        {isOwner && (
          <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <h3 className="font-bold">{t('dashboard.settings.coOrganizers')}</h3>
              <p className="text-sm text-muted-foreground">{t('dashboard.settings.coOrganizersText')}</p>
            </div>
            <InviteButton tournamentId={data.id} kind="co_organizer" />
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
    return <div className="mx-auto grid max-w-[90rem] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[240px_1fr]"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>
  }
  if (!data) return null

  const current = (sections.some(s => s.key === section) ? section : 'overview') as Section
  const props = { data, reload }

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 sm:py-8">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />{t('dashboard.myTournaments')}</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{data.name}</h1>
        <Badge variant="glass" className="border border-border"><StatusDot status={data.status} />{t(`status.${data.status}`)}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{formatDateRange(data.startDate, data.endDate)} · {data.city}</p>
      <ModerationBanner status={data.moderation} note={data.moderationNote} hold={data.reportHold} className="mt-4" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
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
          {current === 'rounds' && <Rounds {...props} />}
          {current === 'draw' && <Draw {...props} />}
          {current === 'ballots' && <Ballots {...props} />}
          {current === 'results' && <><SectionTitle title={t('dashboard.nav.results')} /><ResultsTab id={id} kind="teams" /></>}
          {current === 'settings' && <SettingsSection {...props} />}
        </section>
      </div>
    </div>
  )
}
