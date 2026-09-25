import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  ArrowLeft, Building2, CalendarDays, Clock, DoorOpen, Gavel, Globe, Lock, MapPin, Medal, MessageSquareQuote, Star, Trophy, UserPlus, Users,
} from 'lucide-react'
import { getStandings, getTournamentById, NotFoundError, registerTeam } from '@/api'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { LoginRequiredDialog } from '@/components/auth/guards'
import type { Debate, Round, TournamentDetails } from '@/types'
import { useAsync } from '@/lib/hooks'
import { cn, formatDate, formatDateRange, initials } from '@/lib/utils'
import { Badge, StatusDot, statusVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import NotFound from './NotFound'

const phoneRe = /^\+?7\s?\(?7\d{2}\)?\s?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/

function RegisterTeamDialog({ tournament }: { tournament: TournamentDetails }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [gate, setGate] = useState(false)
  const { user } = useAuth()
  const schema = z.object({
    team: z.string().trim().min(2, t('auth.errors.required')),
    institution: z.string().trim().min(2, t('auth.errors.required')),
    s1: z.string().trim().min(3, t('auth.errors.name')),
    s2: z.string().trim().min(3, t('auth.errors.name')),
    s3: z.string().trim().min(3, t('auth.errors.name')),
    phone: z.string().trim().regex(phoneRe, t('auth.errors.phone')),
  })
  type Form = z.infer<typeof schema>
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    values: { team: '', institution: user?.institution ?? '', s1: user?.name ?? '', s2: '', s3: '', phone: user?.phone ?? '' },
  })

  const onSubmit = async (v: Form) => {
    try {
      await registerTeam(tournament.id, { teamName: v.team, institution: v.institution, speakers: [v.s1, v.s2, v.s3], phone: v.phone })
      toast.success(t('tournament.registerDialog.success'))
      reset()
      setOpen(false)
    } catch (e) {
      toast.error(errorMessage(e, t))
    }
  }

  // guests must sign in first; an unverified email is explained before filling the form
  const onOpenChange = (v: boolean) => {
    if (v && !user) return setGate(true)
    if (v && !user?.emailVerified) return void toast.info(t('apiErrors.email_not_verified'))
    setOpen(v)
  }

  // admins judge or organize, but never compete
  if (user?.role === 'admin') return null
  if (tournament.status !== 'registration') {
    return <Button size="lg" variant="white" disabled><Lock className="size-4" />{t('tournament.registrationClosed')}</Button>
  }

  return (
    <>
      <LoginRequiredDialog open={gate} onOpenChange={setGate} text={t('authGate.registerTeamText')} />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button size="lg" variant="accent"><UserPlus className="size-5" />{t('tournament.register')}</Button>
        </DialogTrigger>
        <DialogContent heading={t('tournament.registerDialog.title')} description={`${tournament.name} · ${t('tournament.registerDialog.text')}`}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="r-team">{t('tournament.registerDialog.teamName')}</Label>
                <Input id="r-team" aria-invalid={!!errors.team} {...register('team')} />
                <FieldError message={errors.team?.message} />
              </div>
              <div>
                <Label htmlFor="r-inst">{t('tournament.registerDialog.institution')}</Label>
                <Input id="r-inst" aria-invalid={!!errors.institution} {...register('institution')} />
                <FieldError message={errors.institution?.message} />
              </div>
            </div>
            {(['s1', 's2', 's3'] as const).map((k, i) => (
              <div key={k}>
                <Label htmlFor={`r-${k}`}>{t('tournament.registerDialog.speaker', { n: i + 1 })}</Label>
                <Input id={`r-${k}`} aria-invalid={!!errors[k]} {...register(k)} />
                <FieldError message={errors[k]?.message} />
              </div>
            ))}
            <div>
              <Label htmlFor="r-phone">{t('tournament.registerDialog.contact')}</Label>
              <Input id="r-phone" type="tel" placeholder="+7 7XX XXX XX XX" aria-invalid={!!errors.phone} {...register('phone')} />
              <FieldError message={errors.phone?.message} />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t('common.loading') : t('tournament.registerDialog.submit')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Overview({ data }: { data: TournamentDetails }) {
  const { t } = useTranslation()
  const days = [...new Set(data.schedule.map(s => s.day))]
  const facts = [
    { icon: Trophy, label: t('tournament.format'), value: 'World Schools (WSDC)' },
    { icon: Medal, label: t('tournament.prelims'), value: data.preliminaryRounds },
    { icon: Star, label: t('tournament.break'), value: data.breakSize },
    { icon: Users, label: t('common.team'), value: `${data.teamsCount} / ${data.maxTeams}` },
    { icon: Globe, label: t('tournament.languages'), value: data.languages.map(l => (l === 'kz' ? 'Қазақша' : 'Русский')).join(', ') },
  ]
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="text-xl font-bold">{t('tournament.about')}</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">{data.description}</p>
        </Card>
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-xl font-bold"><MessageSquareQuote className="size-5 text-primary" />{t('tournament.motions')}</h2>
          <ol className="mt-4 space-y-3">
            {data.rounds.map(r => (
              <li key={r.id} className="flex gap-4 rounded-xl bg-muted/60 p-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">{r.number}</span>
                <p className={cn('text-sm leading-relaxed', r.status === 'draft' && 'italic text-muted-foreground')}>
                  {r.status === 'draft' ? t('tournament.motionHidden') : r.motion}
                </p>
              </li>
            ))}
          </ol>
        </Card>
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-xl font-bold"><Clock className="size-5 text-primary" />{t('tournament.schedule')}</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {days.map(d => (
              <div key={d}>
                <p className="mb-3 text-sm font-bold uppercase tracking-wider text-primary">{t('tournament.day', { n: d })}</p>
                <ul className="relative space-y-3 border-l-2 border-border pl-5">
                  {data.schedule.filter(s => s.day === d).map(s => (
                    <li key={s.time + s.title} className="relative">
                      <span className="absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-card bg-accent" />
                      <span className="text-sm font-bold tabular-nums">{s.time}</span>
                      <span className="ml-3 text-sm text-muted-foreground">{s.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card className="h-fit p-6 lg:sticky lg:top-24">
        <h2 className="text-lg font-bold">{t('tournament.facts')}</h2>
        <dl className="mt-4 divide-y divide-border">
          {facts.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 py-3">
              <Icon className="size-4 shrink-0 text-primary" />
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="ml-auto text-right text-sm font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  )
}

function TeamsTab({ data }: { data: TournamentDetails }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.teams.map((team, i) => (
        <Card key={team.id} className="p-5 transition-shadow hover:shadow-md">
          <div className="flex items-start gap-3">
            <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl text-sm font-extrabold', i % 2 ? 'bg-accent text-navy' : 'bg-primary text-primary-foreground')}>
              {initials(team.name)}
            </span>
            <div className="min-w-0">
              <h3 className="font-bold">{team.name}</h3>
              <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground"><Building2 className="size-3.5 shrink-0" />{team.institution} · {team.city}</p>
            </div>
          </div>
          <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
            {team.speakers.map(s => <li key={s.id} className="text-sm">{s.name}</li>)}
          </ul>
          <span className="sr-only">{t('tournament.speakers')}</span>
        </Card>
      ))}
    </div>
  )
}

function DrawTab({ data }: { data: TournamentDetails }) {
  const { t } = useTranslation()
  const released = data.rounds.filter(r => r.status !== 'draft')
  const [roundId, setRoundId] = useState(released.at(-1)?.id)
  if (!released.length) return <EmptyState icon={<CalendarDays className="size-7" />} title={t('tournament.noDraw')} text={t('tournament.noDrawText')} />

  const round = released.find(r => r.id === roundId) ?? released[0]
  const debates = data.debates.filter(d => d.roundId === round.id)
  const team = (id: string) => data.teams.find(x => x.id === id)!
  const judges = (d: Debate) => d.judgeIds.map(id => data.judges.find(j => j.id === id)!).filter(Boolean)

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {data.rounds.map(r => (
          <button key={r.id} disabled={r.status === 'draft'} onClick={() => setRoundId(r.id)}
            className={cn('cursor-pointer rounded-xl border-2 px-4 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40',
              r.id === round.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50')}>
            {r.name}
          </button>
        ))}
      </div>
      <RoundBanner round={round} />
      {/* desktop table */}
      <Card className="mt-4 hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-3">{t('tournament.room')}</th>
              <th className="px-5 py-3">{t('tournament.proposition')}</th>
              <th className="px-5 py-3">{t('tournament.opposition')}</th>
              <th className="px-5 py-3">{t('tournament.judges')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {debates.map(d => (
              <tr key={d.id} className="hover:bg-muted/40">
                <td className="px-5 py-4 font-semibold">{d.room}</td>
                <td className="px-5 py-4"><TeamCell name={team(d.propositionTeamId).name} win={d.winner === 'proposition'} /></td>
                <td className="px-5 py-4"><TeamCell name={team(d.oppositionTeamId).name} win={d.winner === 'opposition'} /></td>
                <td className="px-5 py-4 text-muted-foreground">
                  {judges(d).map((j, i) => <span key={j.id}>{i > 0 && ', '}{j.name}{i === 0 && <Star className="ml-1 inline size-3 -translate-y-px text-primary" fill="currentColor" aria-label={t('tournament.chair')} />}</span>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {/* mobile cards */}
      <div className="mt-4 space-y-3 md:hidden">
        {debates.map(d => (
          <Card key={d.id} className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-primary"><DoorOpen className="size-3.5" />{d.room}</p>
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
              <div><p className="text-[10px] font-semibold uppercase text-muted-foreground">{t('tournament.proposition')}</p><TeamCell name={team(d.propositionTeamId).name} win={d.winner === 'proposition'} center /></div>
              <span className="text-xs font-extrabold text-muted-foreground">VS</span>
              <div><p className="text-[10px] font-semibold uppercase text-muted-foreground">{t('tournament.opposition')}</p><TeamCell name={team(d.oppositionTeamId).name} win={d.winner === 'opposition'} center /></div>
            </div>
            <p className="mt-3 flex items-start gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground"><Gavel className="mt-0.5 size-3.5 shrink-0" />{judges(d).map(j => j.name).join(', ')}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}

function TeamCell({ name, win, center }: { name: string; win: boolean; center?: boolean }) {
  const { t } = useTranslation()
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5 font-semibold', center && 'justify-center', win && 'text-success')}>
      {name}{win && <Badge variant="success" className="px-1.5 py-0.5 text-[10px]"><Trophy className="size-3" />{t('tournament.winner')}</Badge>}
    </span>
  )
}

function RoundBanner({ round }: { round: Round }) {
  const { t } = useTranslation()
  return (
    <div className="relative overflow-hidden rounded-2xl bg-navy p-5 text-white sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={round.status === 'completed' ? 'muted' : 'accent'}>{t(`tournament.roundStatus.${round.status}`)}</Badge>
        <span className="text-xs text-white/60">{formatDate(round.date, { day: 'numeric', month: 'long' })}</span>
      </div>
      <p className="mt-3 text-lg font-bold leading-snug sm:text-xl">«{round.motion}»</p>
    </div>
  )
}

export function ResultsTab({ id, kind }: { id: string; kind: 'teams' | 'speakers' }) {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => getStandings(id), [id])
  if (error) return <ErrorState onRetry={reload} />
  if (loading || !data) return <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
  const empty = kind === 'teams' ? data.teams.every(r => r.wins + r.losses === 0) : data.speakers.every(s => s.total === 0)
  if (empty) return <EmptyState icon={<Trophy className="size-7" />} title={t('tournament.noResults')} text={t('tournament.noResultsText')} />

  const medal = (rank: number) => rank <= 3
    ? <span className={cn('grid size-8 place-items-center rounded-full text-sm font-extrabold', rank === 1 ? 'bg-accent text-navy' : rank === 2 ? 'bg-slate-200 text-slate-700' : 'bg-orange-200 text-orange-800')}>{rank}</span>
    : <span className="grid size-8 place-items-center text-sm font-bold text-muted-foreground">{rank}</span>

  if (kind === 'teams') {
    return (
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-muted/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-16 px-4 py-3">#</th>
              <th className="px-4 py-3">{t('common.team')}</th>
              <th className="px-4 py-3 text-center">{t('tournament.wins')}</th>
              <th className="px-4 py-3 text-right">{t('tournament.speakerPoints')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.teams.map(r => (
              <tr key={r.team.id} className={cn('hover:bg-muted/40', r.rank <= 4 && 'bg-primary-soft/40')}>
                <td className="px-4 py-3">{medal(r.rank)}</td>
                <td className="px-4 py-3"><p className="font-bold">{r.team.name}</p><p className="text-xs text-muted-foreground">{r.team.institution}</p></td>
                <td className="px-4 py-3 text-center"><span className="font-bold text-success">{r.wins}</span><span className="text-muted-foreground"> – {r.losses}</span></td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{r.speakerPoints.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    )
  }
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-muted/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="w-16 px-4 py-3">#</th>
            <th className="px-4 py-3">{t('common.speaker')}</th>
            <th className="px-4 py-3 text-right">{t('tournament.average')}</th>
            <th className="px-4 py-3 text-right">{t('tournament.total')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.speakers.slice(0, 30).map(r => (
            <tr key={r.speaker.id} className="hover:bg-muted/40">
              <td className="px-4 py-3">{medal(r.rank)}</td>
              <td className="px-4 py-3"><p className="font-bold">{r.speaker.name}</p><p className="text-xs text-muted-foreground">{r.team.name} · {r.team.institution}</p></td>
              <td className="px-4 py-3 text-right tabular-nums">{r.average.toFixed(1)}</td>
              <td className="px-4 py-3 text-right font-bold tabular-nums">{r.total.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function JudgesTab({ data }: { data: TournamentDetails }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data.judges.map(j => (
        <Card key={j.id} className="flex items-center gap-3 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">{initials(j.name)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{j.name}</p>
            <p className="truncate text-xs text-muted-foreground">{j.institution}</p>
          </div>
          {j.isChair && <Badge variant="accent">{t('tournament.chair')}</Badge>}
        </Card>
      ))}
    </div>
  )
}

function PageSkeleton() {
  return (
    <>
      <Skeleton className="h-80 rounded-none" />
      <div className="container-page space-y-4 py-10">
        <Skeleton className="h-12 w-full max-w-xl" />
        <Skeleton className="h-64" />
      </div>
    </>
  )
}

export default function TournamentPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => getTournamentById(id), [id])
  // deep links like /tournaments/:id?tab=draw (e.g. from "My debates")
  const [params] = useSearchParams()
  const tabs = ['overview', 'teams', 'draw', 'results', 'speakers', 'judges']
  const requestedTab = params.get('tab')

  if (error instanceof NotFoundError) return <NotFound />
  if (error) return <div className="container-page py-20"><ErrorState onRetry={reload} /></div>
  if (loading || !data) return <PageSkeleton />

  return (
    <>
      <section className="relative -mt-16 overflow-hidden pt-16 text-white lg:-mt-18 lg:pt-18">
        <img src={data.cover} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/75 to-navy/30" />
        <div className="container-page relative pb-10 pt-10 sm:pb-14 sm:pt-20">
          <Link to="/tournaments" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/80 hover:text-white"><ArrowLeft className="size-4" />{t('nav.tournaments')}</Link>
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge variant={statusVariant[data.status] === 'muted' ? 'glass' : statusVariant[data.status]}><StatusDot status={data.status} />{t(`status.${data.status}`)}</Badge>
            <Badge variant="accent">{data.format}</Badge>
            <Badge variant="glass">{t(`level.${data.level}`)}</Badge>
          </div>
          <h1 className="mt-4 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl">{data.name}</h1>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/85">
            <span className="flex items-center gap-2"><CalendarDays className="size-4 text-accent" />{formatDateRange(data.startDate, data.endDate)}</span>
            <span className="flex items-center gap-2"><MapPin className="size-4 text-accent" />{data.city}</span>
            <span className="flex items-center gap-2"><Building2 className="size-4 text-accent" />{t('tournament.organizer')}: {data.organizer}</span>
          </div>
          <div className="mt-8"><RegisterTeamDialog tournament={data} /></div>
        </div>
      </section>

      <div className="container-page py-8 sm:py-10">
        <Tabs defaultValue={requestedTab && tabs.includes(requestedTab) ? requestedTab : data.status === 'registration' ? 'overview' : 'draw'}>
          <TabsList>
            <TabsTrigger value="overview">{t('tournament.tabs.overview')}</TabsTrigger>
            <TabsTrigger value="teams">{t('tournament.tabs.teams')} <span className="ml-1 text-xs opacity-60">{data.teams.length}</span></TabsTrigger>
            <TabsTrigger value="draw">{t('tournament.tabs.draw')}</TabsTrigger>
            <TabsTrigger value="results">{t('tournament.tabs.results')}</TabsTrigger>
            <TabsTrigger value="speakers">{t('tournament.tabs.speakers')}</TabsTrigger>
            <TabsTrigger value="judges">{t('tournament.tabs.judges')}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><Overview data={data} /></TabsContent>
          <TabsContent value="teams"><TeamsTab data={data} /></TabsContent>
          <TabsContent value="draw"><DrawTab data={data} /></TabsContent>
          <TabsContent value="results"><ResultsTab id={data.id} kind="teams" /></TabsContent>
          <TabsContent value="speakers"><ResultsTab id={data.id} kind="speakers" /></TabsContent>
          <TabsContent value="judges"><JudgesTab data={data} /></TabsContent>
        </Tabs>
      </div>
    </>
  )
}
