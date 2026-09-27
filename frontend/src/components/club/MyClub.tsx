import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Clock, KeyRound, Loader2, Plus, Search, X } from 'lucide-react'
import { cancelClubRequest, createClub, getMe, getMyClubRequests, joinClub } from '@/api'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label, Textarea } from '@/components/ui/input'
import { ManageClub } from './ManageClub'

// Profile tab "My club": your club is managed here (it is personal, not on the public pages).
// Without a club: create one, join with a code, or follow the requests you sent from club pages.
export function MyClub() {
  const { user, signIn } = useAuth()
  const refreshMe = async () => { const me = await getMe(); if (me) signIn(me) }
  if (!user) return null
  if (user.club) return <ManageClub clubId={user.club.id} onLeft={refreshMe} />
  return <NoClub onJoined={refreshMe} />
}

function NoClub({ onJoined }: { onJoined: () => Promise<void> }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const requests = useAsync(getMyClubRequests)
  const [f, setF] = useState({ name: '', city: user?.city ?? '', institution: user?.institution ?? '', description: '' })
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const act = async (kind: 'create' | 'join', fn: () => Promise<unknown>, ok: string) => {
    if (!user?.emailVerified) return void toast.info(t('apiErrors.email_not_verified'))
    setBusy(kind)
    try { await fn(); toast.success(ok); await onJoined() } catch (e) { toast.error(errorMessage(e, t)) } finally { setBusy(null) }
  }

  return (
    <div className="space-y-5">
      <p className="rounded-2xl border border-accent bg-accent-soft p-4 text-sm">{t('club.cardText')}</p>
      {!!requests.data?.length && (
        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-bold"><Clock className="size-4 text-primary" />{t('club.request.mine')}</h3>
          <ul className="mt-3 divide-y divide-border">
            {requests.data.map(r => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <Link to={`/clubs/${r.club.id}`} className="flex-1 font-semibold text-primary hover:underline">{r.club.name}</Link>
                <span className="text-xs text-muted-foreground">{r.club.city} · {formatDateTime(r.createdAt)}</span>
                <Button size="sm" variant="ghost" onClick={async () => { try { await cancelClubRequest(r.id); requests.reload() } catch (e) { toast.error(errorMessage(e, t)) } }}>
                  <X className="size-4" />{t('club.request.cancel')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <Card className="p-6">
          <h3 className="flex items-center gap-2 font-bold"><Plus className="size-4 text-primary" />{t('club.createClub')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('club.createText')}</p>
          <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void act('create', () => createClub({ ...f, institution: f.institution || undefined }), t('club.created')) }}>
            <div className="sm:col-span-2"><Label htmlFor="mc-name">{t('club.name')}</Label><Input id="mc-name" maxLength={80} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder={t('club.namePlaceholder')} /></div>
            <div><Label htmlFor="mc-city">{t('common.city')}</Label><Input id="mc-city" maxLength={60} value={f.city} onChange={e => setF({ ...f, city: e.target.value })} /></div>
            <div><Label htmlFor="mc-inst">{t('common.institution')}</Label><Input id="mc-inst" maxLength={150} value={f.institution} onChange={e => setF({ ...f, institution: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label htmlFor="mc-desc">{t('club.description')}</Label><Textarea id="mc-desc" rows={3} maxLength={2000} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" disabled={!!busy || f.name.trim().length < 2 || f.city.trim().length < 2}>{busy === 'create' && <Loader2 className="size-4 animate-spin" />}{t('club.create')}</Button>
            </div>
          </form>
        </Card>
        <div className="space-y-5">
          <Card className="p-6">
            <h3 className="flex items-center gap-2 font-bold"><KeyRound className="size-4 text-primary" />{t('club.joinByCode')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('club.joinCodeText')}</p>
            <form className="mt-4 flex gap-2" onSubmit={e => { e.preventDefault(); void act('join', () => joinClub(code.trim()), t('club.joinedShort')) }}>
              <Input maxLength={8} value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABCD2345" className="text-center font-mono tracking-[0.25em]" aria-label={t('club.code')} />
              <Button type="submit" disabled={!!busy || code.trim().length !== 8} className="shrink-0">{busy === 'join' && <Loader2 className="size-4 animate-spin" />}{t('club.join')}</Button>
            </form>
          </Card>
          <Card className="p-6">
            <h3 className="flex items-center gap-2 font-bold"><Search className="size-4 text-primary" />{t('club.findTitle')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('club.findText')}</p>
            <Button asChild variant="outline" className="mt-4"><Link to="/clubs">{t('club.allClubs')}</Link></Button>
          </Card>
        </div>
      </div>
    </div>
  )
}
