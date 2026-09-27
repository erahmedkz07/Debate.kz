import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Building2, Check, Copy, History, Link2, LogOut, MapPin, Pencil, Plus, RefreshCw, Trash2, UserMinus, Users } from 'lucide-react'
import {
  createClubTeam, deleteClubTeam, getClub, getMe, leaveClub, NotFoundError, removeClubMember, renameClubTeam, resetClubCode, setMemberTeam, updateClub,
} from '@/api'
import type { ClubDetails, ClubMemberInfo } from '@/types'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/utils'
import { Avatar } from '@/components/auth/UserMenu'
import { PageHeader } from '@/components/layout/Layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import NotFound from './NotFound'

// The club page: public view for everyone; members (all equal) manage the club right here
export default function ClubPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => getClub(id), [id])
  if (error instanceof NotFoundError) return <NotFound />
  if (error) return <div className="container-page py-20"><ErrorState onRetry={reload} /></div>
  if (loading && !data) return <div className="container-page space-y-4 py-10"><Skeleton className="h-40" /><Skeleton className="h-72" /></div>
  if (!data) return null
  const noTeam = data.members.filter(m => !m.teamId)

  return (
    <>
      <PageHeader title={data.name} subtitle={data.description || t('club.noDescription')}>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><MapPin className="size-4 text-primary" />{data.city}</span>
          {data.institution && <span className="flex items-center gap-1.5"><Building2 className="size-4 text-primary" />{data.institution}</span>}
          <span className="flex items-center gap-1.5"><Users className="size-4 text-primary" />{t('club.membersCount', { count: data.members.length })} · {t('club.teamsCount', { count: data.teams.length })}</span>
          {data.isMember && <Badge variant="success"><Check className="size-3" />{t('club.youAreMember')}</Badge>}
        </div>
      </PageHeader>
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-6">
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{t('club.teams')}</h2>
              {data.isMember && <AddTeam club={data} onDone={reload} />}
            </div>
            {data.teams.length === 0 ? <EmptyState icon={<Users className="size-7" />} title={t('club.noTeams')} text={data.isMember ? t('club.noTeamsMember') : undefined} /> : (
              <div className="grid gap-4 xl:grid-cols-2">
                {data.teams.map(team => <TeamCard key={team.id} club={data} team={team} onDone={reload} />)}
              </div>
            )}
          </section>
          {noTeam.length > 0 && (
            <section>
              <h2 className="mb-3 text-xl font-bold">{t('club.noTeamMembers')}</h2>
              <Card className="divide-y divide-border">{noTeam.map(m => <MemberRow key={m.id} club={data} m={m} onDone={reload} />)}</Card>
            </section>
          )}
        </div>
        <aside className="space-y-4">
          {data.isMember ? <MemberTools club={data} onDone={reload} /> : <JoinHint />}
          {data.log && <ClubLog log={data.log} />}
        </aside>
      </div>
    </>
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

// invite link, club details and leaving: available to every member
function MemberTools({ club, onDone }: { club: ClubDetails; onDone: () => void }) {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [edit, setEdit] = useState(false)
  const [leave, setLeave] = useState(false)
  const [f, setF] = useState({ name: club.name, city: club.city, institution: club.institution ?? '', description: club.description })
  const link = `${location.origin}/clubs/join/${club.joinCode}`
  const refreshMe = async () => { const me = await getMe(); if (me) signIn(me) }
  // true when it worked, so a dialog closes only on success
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast.success(ok); onDone(); return true } catch (e) { toast.error(errorMessage(e, t)); return false }
  }
  return (
    <>
      <Card className="p-5">
        <h3 className="flex items-center gap-2 font-bold"><Link2 className="size-4 text-primary" />{t('club.inviteTitle')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('club.inviteText')}</p>
        <div className="mt-3 flex gap-2">
          <Input readOnly value={link} aria-label={t('club.inviteTitle')} onFocus={e => e.target.select()} className="font-mono text-xs" />
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success(t('club.copied')), () => toast(link))}><Copy className="size-4" /></Button>
        </div>
        <button type="button" onClick={() => act(() => resetClubCode(club.id), t('club.codeReset'))} className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"><RefreshCw className="size-3.5" />{t('club.resetCode')}</button>
      </Card>
      <Card className="flex flex-col gap-2 p-5">
        <Button variant="outline" onClick={() => setEdit(true)}><Pencil className="size-4" />{t('club.edit')}</Button>
        <Button variant="ghost" className="text-danger" onClick={() => setLeave(true)}><LogOut className="size-4" />{t('club.leave')}</Button>
        <p className="text-xs text-muted-foreground">{t('club.equalNote')}</p>
      </Card>
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent heading={t('club.edit')}>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void act(() => updateClub(club.id, f), t('common.saved')).then(ok => { if (ok) { setEdit(false); void refreshMe() } }) }}>
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
              try { await leaveClub(club.id); await refreshMe(); toast(t('club.left')); navigate('/clubs') } catch (e) { toast.error(errorMessage(e, t)) }
            }}><LogOut className="size-4" />{t('club.leave')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function JoinHint() {
  const { t } = useTranslation()
  return (
    <Card className="p-5">
      <h3 className="font-bold">{t('club.howToJoin')}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t('club.howToJoinText')}</p>
      <Button asChild variant="outline" className="mt-4"><Link to="/clubs">{t('club.allClubs')}</Link></Button>
    </Card>
  )
}

function ClubLog({ log }: { log: NonNullable<ClubDetails['log']> }) {
  const { t } = useTranslation()
  const [all, setAll] = useState(false)
  const shown = all ? log : log.slice(0, 6)
  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-2 font-bold"><History className="size-4 text-primary" />{t('club.log')}</h3>
      <ul className="mt-3 space-y-2.5 text-sm">
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
