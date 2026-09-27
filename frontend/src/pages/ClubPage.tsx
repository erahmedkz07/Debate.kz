import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Building2, Check, Clock, MapPin, Send, Settings, Users, X } from 'lucide-react'
import { cancelClubRequest, getClub, NotFoundError, requestToJoinClub } from '@/api'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { Avatar } from '@/components/auth/UserMenu'
import { LoginRequiredDialog } from '@/components/auth/guards'
import { BackButton } from '@/components/layout/BackButton'
import { PageHeader } from '@/components/layout/Layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import NotFound from './NotFound'

// Public club page: who the club is, its teams and members. Anyone can ask to join the club
// (only the club: its members then decide the team). The club is managed in the profile ("My club").
export default function ClubPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data, loading, error, reload } = useAsync(() => getClub(id), [id, user?.id])
  const [gate, setGate] = useState(false)
  const [asking, setAsking] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  if (error instanceof NotFoundError) return <NotFound />
  if (error) return <div className="container-page py-20"><ErrorState onRetry={reload} /></div>
  if (loading && !data) return <div className="container-page space-y-4 py-10"><Skeleton className="h-40" /><Skeleton className="h-72" /></div>
  if (!data) return null
  const noTeam = data.members.filter(m => !m.teamId)

  const openAsk = () => {
    if (!user) return setGate(true)
    if (!user.emailVerified) return void toast.info(t('apiErrors.email_not_verified'))
    setAsking(true)
  }
  const send = async () => {
    setBusy(true)
    try { await requestToJoinClub(data.id, message.trim()); toast.success(t('club.request.sent')); setAsking(false); setMessage(''); reload() } catch (e) { toast.error(errorMessage(e, t)) } finally { setBusy(false) }
  }
  const cancel = async () => {
    try { await cancelClubRequest(data.myRequest!); toast(t('club.request.cancelled')); reload() } catch (e) { toast.error(errorMessage(e, t)) }
  }

  // the one action on this page depends on who looks
  const action = data.isMember ? (
    <div className="flex flex-wrap items-center gap-3">
      <Badge variant="success"><Check className="size-3" />{t('club.youAreMember')}</Badge>
      <Button asChild variant="outline" size="sm"><Link to="/me?tab=club"><Settings className="size-4" />{t('club.manageInProfile')}</Link></Button>
    </div>
  ) : data.myRequest ? (
    <div className="flex flex-wrap items-center gap-3">
      <Badge variant="accent"><Clock className="size-3" />{t('club.request.waiting')}</Badge>
      <Button variant="ghost" size="sm" onClick={cancel}><X className="size-4" />{t('club.request.cancel')}</Button>
    </div>
  ) : user?.club ? (
    <p className="text-sm text-muted-foreground">{t('club.inOtherClub', { name: user.club.name })}</p>
  ) : user?.role === 'admin' ? null : (
    <Button onClick={openAsk}><Send className="size-4" />{t('club.request.ask')}</Button>
  )

  return (
    <>
      <PageHeader title={data.name} subtitle={data.description || t('club.noDescription')} back={<BackButton fallback="/clubs" />}>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><MapPin className="size-4 text-primary" />{data.city}</span>
          {data.institution && <span className="flex items-center gap-1.5"><Building2 className="size-4 text-primary" />{data.institution}</span>}
          <span className="flex items-center gap-1.5"><Users className="size-4 text-primary" />{t('club.membersCount', { count: data.members.length })} · {t('club.teamsCount', { count: data.teams.length })}</span>
        </div>
        <div className="mt-6">{action}</div>
      </PageHeader>
      <div className="container-page space-y-8 py-10">
        <section>
          <h2 className="mb-4 text-xl font-bold">{t('club.teams')}</h2>
          {data.teams.length === 0 ? <EmptyState icon={<Users className="size-7" />} title={t('club.noTeams')} /> : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.teams.map(team => (
                <Card key={team.id} className="p-5">
                  <h3 className="text-lg font-bold">{team.name}</h3>
                  {team.members.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t('club.emptyTeam')}</p> : (
                    <ul className="mt-3 space-y-2">
                      {team.members.map(m => (
                        <li key={m.id} className="flex items-center gap-2.5 text-sm">
                          <Avatar name={m.name} role="user" src={m.avatarUrl} className="size-8 text-xs" />{m.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>
        {noTeam.length > 0 && (
          <section>
            <h2 className="mb-3 text-xl font-bold">{t('club.noTeamMembers')}</h2>
            <div className="flex flex-wrap gap-2">
              {noTeam.map(m => <span key={m.id} className="flex items-center gap-2 rounded-full bg-muted py-1 pl-1 pr-3 text-sm"><Avatar name={m.name} role="user" src={m.avatarUrl} className="size-7 text-[10px]" />{m.name}</span>)}
            </div>
          </section>
        )}
      </div>

      <LoginRequiredDialog open={gate} onOpenChange={setGate} text={t('club.loginText')} />
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent heading={t('club.request.ask')} description={t('club.request.askText', { name: data.name })}>
          <Textarea rows={3} maxLength={300} value={message} onChange={e => setMessage(e.target.value)} placeholder={t('club.request.placeholder')} aria-label={t('club.request.message')} />
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button disabled={busy} onClick={send}><Send className="size-4" />{t('club.request.send')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
