import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Building2, Check, Copy, Eye, History, Link2, LogOut, MapPin, Pencil, Plus, RefreshCw, Trash2, UserMinus, UserPlus, Users } from 'lucide-react'
import {
  answerClubRequest, createClubTeam, deleteClubTeam, getClub, getClubRequests, getMe, leaveClub, removeClubMember, renameClubTeam, resetClubCode, setMemberTeam, updateClub,
} from '@/api'
import type { ClubDetails, ClubMemberInfo } from '@/types'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/utils'
import { Avatar } from '@/components/auth/UserMenu'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'

// "My club" in the profile: members (all equal) manage the club here — teams, members, requests, the join link.
// The public club page only shows the club; nothing is managed there.
export function ManageClub({ clubId, onLeft }: { clubId: string; onLeft: () => void }) {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => getClub(clubId), [clubId])
  if (error) return <ErrorState onRetry={reload} />
  if (loading && !data) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-72" /></div>
  if (!data) return null
  const noTeam = data.members.filter(m => !m.teamId)

  return (
    <div className="space-y-6">
      {/* one header card: who the club is, what a member can do, and the join link */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="min-w-0">
            <h2 className="text-2xl font-extrabold tracking-tight">{data.name}</h2>
            <p className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><MapPin className="size-4 text-primary" />{data.city}</span>
              {data.institution && <span className="flex items-center gap-1.5"><Building2 className="size-4 text-primary" />{data.institution}</span>}
              <span className="flex items-center gap-1.5"><Users className="size-4 text-primary" />{t('club.membersCount', { count: data.members.length })} · {t('club.teamsCount', { count: data.teams.length })}</span>
            </p>
          </div>
          <MemberTools club={data} onDone={reload} onLeft={onLeft} />
        </div>
        <InviteLink club={data} onDone={reload} />
      </Card>

      <JoinRequests club={data} onDone={reload} />

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold">{t('club.teams')}</h3>
          <AddTeam club={data} onDone={reload} />
        </div>
        {data.teams.length === 0 ? <EmptyState icon={<Users className="size-7" />} title={t('club.noTeams')} text={t('club.noTeamsMember')} /> : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {data.teams.map(team => <TeamCard key={team.id} club={data} team={team} onDone={reload} />)}
          </div>
        )}
      </section>
      {noTeam.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-bold">{t('club.noTeamMembers')}</h3>
          <Card className="divide-y divide-border">{noTeam.map(m => <MemberRow key={m.id} club={data} m={m} onDone={reload} />)}</Card>
        </section>
      )}
      {data.log && data.log.length > 0 && <ClubLog log={data.log} />}
      <p className="text-center text-xs text-muted-foreground">{t('club.equalNote')}</p>
    </div>
  )
}

// people who asked to join from the public page: accept (straight into a team, optionally) or decline
function JoinRequests({ club, onDone }: { club: ClubDetails; onDone: () => void }) {
  const { t } = useTranslation()
  const { data, reload } = useAsync(() => getClubRequests(club.id), [club.id, club.pendingRequests])
  const [teamFor, setTeamFor] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  if (!data?.length) return null
  const answer = async (id: string, status: 'accepted' | 'declined') => {
    setBusy(id)
    try {
      await answerClubRequest(id, status, status === 'accepted' ? (teamFor[id] && teamFor[id] !== 'none' ? teamFor[id] : null) : undefined)
      toast.success(t(`club.request.${status}`))
      reload(); onDone()
    } catch (e) {
      toast.error(errorMessage(e, t))
    } finally {
      setBusy(null)
    }
  }
  return (
    <Card className="overflow-hidden ring-2 ring-accent">
      <h3 className="flex items-center gap-2 border-b border-border bg-accent-soft/60 px-5 py-3 font-bold"><UserPlus className="size-4 text-primary" />{t('club.request.title', { count: data.length })}</h3>
      <ul className="divide-y divide-border">
        {data.map(r => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <Avatar name={r.user.name} role="user" src={r.user.avatarUrl} className="size-10" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{r.user.name}</p>
              <p className="text-xs text-muted-foreground">{[r.user.institution, r.user.city].filter(Boolean).join(' · ')}{r.user.institution || r.user.city ? ' · ' : ''}{formatDateTime(r.createdAt)}</p>
              {r.message && <p className="mt-1 text-sm italic">«{r.message}»</p>}
            </div>
            <Select size="sm" className="w-40" value={teamFor[r.id] ?? 'none'} onValueChange={v => setTeamFor({ ...teamFor, [r.id]: v })} aria-label={t('club.request.team')}
              options={[{ value: 'none', label: t('club.noTeam') }, ...club.teams.map(x => ({ value: x.id, label: x.name }))]} />
            <Button size="sm" disabled={busy === r.id} onClick={() => answer(r.id, 'accepted')}><Check className="size-4" />{t('club.request.accept')}</Button>
            <Button size="sm" variant="ghost" className="text-danger" disabled={busy === r.id} onClick={() => answer(r.id, 'declined')}>{t('club.request.decline')}</Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function TeamCard({ club, team, onDone }: { club: ClubDetails; team: ClubDetails['teams'][number]; onDone: () => void }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(team.name)
  const [confirm, setConfirm] = useState(false)
  // true when it worked, so a dialog closes only on success
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast.success(ok); onDone(); return true } catch (e) { toast.error(errorMessage(e, t)); return false }
  }
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <form className="flex flex-1 gap-2" onSubmit={e => { e.preventDefault(); void act(() => renameClubTeam(team.id, name.trim())).then(ok => ok && setEditing(false)) }}>
            <Input autoFocus value={name} maxLength={80} onChange={e => setName(e.target.value)} aria-label={t('club.teamName')} />
            <Button type="submit" size="sm" disabled={name.trim().length < 2}><Check className="size-4" /></Button>
          </form>
        ) : <h3 className="text-lg font-bold">{team.name}</h3>}
        {club.isMember && !editing && (
          <div className="flex gap-1">
            <button type="button" onClick={() => setEditing(true)} title={t('club.rename')} aria-label={t('club.rename')} className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-muted"><Pencil className="size-4" /></button>
            <button type="button" onClick={() => setConfirm(true)} title={t('club.deleteTeam')} aria-label={t('club.deleteTeam')} className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-danger-soft hover:text-danger"><Trash2 className="size-4" /></button>
          </div>
        )}
      </div>
      {team.members.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t('club.emptyTeam')}</p> : (
        <ul className="mt-3 divide-y divide-border">{team.members.map(m => <MemberRow key={m.id} club={club} m={m} onDone={onDone} compact />)}</ul>
      )}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent heading={t('club.deleteTeam')} description={t('club.deleteTeamText', { name: team.name })}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button variant="danger" onClick={() => act(() => deleteClubTeam(team.id), t('club.teamDeleted')).then(ok => ok && setConfirm(false))}><Trash2 className="size-4" />{t('common.delete')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// a member row: members of the club can move anyone to another team or remove them
function MemberRow({ club, m, onDone, compact }: { club: ClubDetails; m: ClubMemberInfo; onDone: () => void; compact?: boolean }) {
  const { t } = useTranslation()
  const { user, signIn } = useAuth()
  const [confirm, setConfirm] = useState(false)
  const me = user?.id === m.id
  // true when it worked, so a dialog closes only on success
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast.success(ok); onDone(); return true } catch (e) { toast.error(errorMessage(e, t)); return false }
  }
  const Tag = compact ? 'li' : 'div'
  return (
    <Tag className={compact ? 'flex flex-wrap items-center gap-3 py-2.5' : 'flex flex-wrap items-center gap-3 px-5 py-3'}>
      <Avatar name={m.name} role="user" src={m.avatarUrl} className="size-8 text-xs" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}{me && <span className="font-normal text-muted-foreground"> · {t('club.you')}</span>}</span>
      {club.isMember && (
        <>
          <Select size="sm" className={compact ? "w-32 shrink-0" : "w-40 shrink-0"} aria-label={t('club.moveTo', { name: m.name })} value={m.teamId ?? 'none'}
            // moving yourself changes the team shown in your profile too
            onValueChange={v => act(() => setMemberTeam(club.id, m.id, v === 'none' ? null : v)).then(async ok => { if (ok && me) { const u = await getMe(); if (u) signIn(u) } })}
            options={[{ value: 'none', label: t('club.noTeam') }, ...club.teams.map(x => ({ value: x.id, label: x.name }))]} />
          {!me && (
            <button type="button" onClick={() => setConfirm(true)} title={t('club.remove')} aria-label={t('club.remove')} className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-danger-soft hover:text-danger"><UserMinus className="size-4" /></button>
          )}
          <Dialog open={confirm} onOpenChange={setConfirm}>
            <DialogContent heading={t('club.remove')} description={t('club.removeText', { name: m.name })}>
              <div className="flex justify-end gap-2">
                <DialogClose asChild><Button variant="ghost">{t('common.cancel')}</Button></DialogClose>
                <Button variant="danger" onClick={() => act(() => removeClubMember(club.id, m.id), t('club.removed')).then(ok => ok && setConfirm(false))}>{t('club.remove')}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </Tag>
  )
}

function AddTeam({ club, onDone }: { club: ClubDetails; onDone: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [join, setJoin] = useState(true)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await createClubTeam(club.id, name.trim(), join); toast.success(t('club.teamCreated')); setName(''); setOpen(false); onDone() } catch (err) { toast.error(errorMessage(err, t)) }
  }
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" />{t('club.addTeam')}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent heading={t('club.addTeam')} description={t('club.addTeamText')}>
          <form className="space-y-4" onSubmit={submit}>
            <div><Label htmlFor="ct-name">{t('club.teamName')}</Label><Input id="ct-name" autoFocus maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder={t('club.teamPlaceholder')} /></div>
            <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={join} onChange={e => setJoin(e.target.checked)} />{t('club.joinNewTeam')}</label>
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
              <Button type="submit" disabled={name.trim().length < 2}>{t('club.create')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

// the join link: every member can share it or make a new one (the old link stops working)
function InviteLink({ club, onDone }: { club: ClubDetails; onDone: () => void }) {
  const { t } = useTranslation()
  const link = `${location.origin}/clubs/join/${club.joinCode}`
  const reset = async () => {
    try { await resetClubCode(club.id); toast.success(t('club.codeReset')); onDone() } catch (e) { toast.error(errorMessage(e, t)) }
  }
  return (
    <div className="grid grid-cols-1 gap-3 border-t border-border bg-muted/40 px-6 py-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:items-center">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold"><Link2 className="size-4 text-primary" />{t('club.inviteTitle')}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('club.inviteText')}</p>
      </div>
      <div className="flex min-w-0 gap-2">
        <Input readOnly value={link} aria-label={t('club.inviteTitle')} onFocus={e => e.target.select()} className="min-w-0 font-mono text-xs" />
        <Button size="sm" variant="outline" className="h-11 shrink-0" title={t('club.copied')} aria-label={t('club.copied')} onClick={() => navigator.clipboard.writeText(link).then(() => toast.success(t('club.copied')), () => toast(link))}><Copy className="size-4" /></Button>
        <Button size="sm" variant="ghost" className="h-11 shrink-0" title={t('club.resetCode')} aria-label={t('club.resetCode')} onClick={reset}><RefreshCw className="size-4" /></Button>
      </div>
    </div>
  )
}

// the club's details, the public page and leaving: available to every member
function MemberTools({ club, onDone, onLeft }: { club: ClubDetails; onDone: () => void; onLeft: () => void }) {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const [edit, setEdit] = useState(false)
  const [leave, setLeave] = useState(false)
  const [f, setF] = useState({ name: club.name, city: club.city, institution: club.institution ?? '', description: club.description })
  const refreshMe = async () => { const me = await getMe(); if (me) signIn(me) }
  // true when it worked, so a dialog closes only on success
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast.success(ok); onDone(); return true } catch (e) { toast.error(errorMessage(e, t)); return false }
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm"><Link to={`/clubs/${club.id}`}><Eye className="size-4" />{t('club.publicPage')}</Link></Button>
        <Button variant="outline" size="sm" onClick={() => { setF({ name: club.name, city: club.city, institution: club.institution ?? '', description: club.description }); setEdit(true) }}><Pencil className="size-4" />{t('club.edit')}</Button>
        <Button variant="ghost" size="sm" className="text-danger" onClick={() => setLeave(true)}><LogOut className="size-4" />{t('club.leave')}</Button>
      </div>
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent heading={t('club.edit')}>
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void act(() => updateClub(club.id, f), t('common.saved')).then(ok => { if (ok) { setEdit(false); void refreshMe() } }) }}>
            <div className="sm:col-span-2"><Label htmlFor="c-name">{t('club.name')}</Label><Input id="c-name" maxLength={80} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
            <div><Label htmlFor="c-city">{t('common.city')}</Label><Input id="c-city" maxLength={60} value={f.city} onChange={e => setF({ ...f, city: e.target.value })} /></div>
            <div><Label htmlFor="c-inst">{t('common.institution')}</Label><Input id="c-inst" maxLength={150} value={f.institution} onChange={e => setF({ ...f, institution: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label htmlFor="c-desc">{t('club.description')}</Label><Textarea id="c-desc" rows={4} maxLength={2000} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
              <Button type="submit" disabled={f.name.trim().length < 2 || f.city.trim().length < 2}>{t('common.save')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={leave} onOpenChange={setLeave}>
        <DialogContent heading={t('club.leave')} description={t('club.leaveText', { name: club.name })}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button variant="danger" onClick={async () => {
              try { await leaveClub(club.id); await refreshMe(); toast(t('club.left')); setLeave(false); onLeft() } catch (e) { toast.error(errorMessage(e, t)) }
            }}><LogOut className="size-4" />{t('club.leave')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}


function ClubLog({ log }: { log: NonNullable<ClubDetails['log']> }) {
  const { t } = useTranslation()
  const [all, setAll] = useState(false)
  const shown = all ? log : log.slice(0, 6)
  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-2 font-bold"><History className="size-4 text-primary" />{t('club.log')}</h3>
      <ul className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm md:grid-cols-2">
        {shown.map(l => (
          <li key={l.id}>
            <b>{l.userName}</b> {t(`club.actions.${l.action}`, { defaultValue: l.action })}{l.detail && <span className="text-muted-foreground"> · {l.detail}</span>}
            <span className="block text-xs text-muted-foreground">{formatDateTime(l.createdAt)}</span>
          </li>
        ))}
      </ul>
      {log.length > 6 && <button type="button" onClick={() => setAll(!all)} className="mt-3 cursor-pointer text-xs font-semibold text-primary hover:underline">{all ? t('club.logLess') : t('club.logMore')}</button>}
    </Card>
  )
}
