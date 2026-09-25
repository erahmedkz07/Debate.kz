import type { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { esc, linkable, sendMessage, telegramEnabled, TelegramError, type InlineButton, type SendOptions } from '../lib/telegram.js'

// Notifications. Every event lands in the in-app notification centre (type + data, rendered in RU/KZ on the site)
// and, for people who linked the bot themselves, is also sent to Telegram.
// Recipients follow per-tournament rights: speakers, judges, organizers of that tournament; admins get platform events.
// Sending never breaks the request that triggered it: call these with background().

export function background(p: Promise<unknown>) {
  p.catch(e => console.error('[notify]', e instanceof Error ? e.message : e))
}

const site = (path: string) => `${env.CLIENT_ORIGIN}${path}`

// a link as a button when Telegram accepts it (public https), otherwise as a line of text
function withLink(text: string, label: string, path: string, extra: InlineButton[][] = []): [string, SendOptions] {
  const url = site(path)
  if (linkable(url)) return [text, { buttons: [[{ text: label, url }], ...extra] }]
  return [`${text}\n\n${label}: ${url}`, extra.length ? { buttons: extra } : {}]
}

export async function notifyUsers(userIds: (string | null | undefined)[], build: (userId: string) => [string, SendOptions?]) {
  if (!telegramEnabled()) return
  const ids = [...new Set(userIds.filter((x): x is string => !!x))]
  if (!ids.length) return
  const users = await prisma.user.findMany({ where: { id: { in: ids }, telegramChatId: { not: null }, telegramNotify: true, blocked: false } })
  for (const u of users) {
    const [text, opts] = build(u.id)
    try {
      await sendMessage(u.telegramChatId!, text, opts)
    } catch (e) {
      // the person blocked the bot or deleted the chat: stop trying
      if (e instanceof TelegramError && (e.code === 403 || /chat not found/i.test(e.message))) {
        await prisma.user.update({ where: { id: u.id }, data: { telegramChatId: null } })
      } else throw e
    }
  }
}

// ---------- in-app notification centre ----------

type Data = Prisma.InputJsonObject
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))]

export async function inbox(userIds: (string | null | undefined)[], type: string, data: Data, link?: string) {
  const to = uniq(userIds)
  if (to.length) await prisma.notification.createMany({ data: to.map(userId => ({ userId, type, data, link })) })
}

const organizersOf = async (tournamentId: string) =>
  (await prisma.tournamentOrganizer.findMany({ where: { tournamentId }, select: { userId: true } })).map(o => o.userId)
const admins = async () => (await prisma.user.findMany({ where: { role: 'admin', blocked: false }, select: { id: true } })).map(u => u.id)

// ---------- domain events ----------

// a round was published: speakers get their room, side, opponent and motion; judges get their room and ballot link
export async function notifyRoundReleased(roundId: string) {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      tournament: { select: { name: true, id: true } },
      debates: {
        include: {
          proposition: { include: { speakers: { select: { userId: true } } } },
          opposition: { include: { speakers: { select: { userId: true } } } },
          judges: { include: { judge: { select: { userId: true } } } },
        },
      },
    },
  })
  if (!round) return
  const t = round.tournament
  const head = `📢 <b>${esc(t.name)}</b> · ${esc(round.name)}`
  const motion = round.motion ? `\nТема: «${esc(round.motion)}»` : ''
  for (const d of round.debates) {
    for (const [side, team, other] of [['proposition', d.proposition, d.opposition], ['opposition', d.opposition, d.proposition]] as const) {
      const speakers = team.speakers.map(s => s.userId)
      await inbox(speakers, 'participant.drawReleased',
        { tournament: t.name, round: round.name, room: d.room, side, opponent: other.name, motion: round.motion }, `/tournaments/${t.id}?tab=draw`)
      await notifyUsers(speakers, () =>
        withLink(`${head}\n\n🚪 Аудитория: <b>${esc(d.room)}</b>\nВы — <b>${side === 'proposition' ? 'Правительство' : 'Оппозиция'}</b> против «${esc(other.name)}»${motion}`,
          'Жеребьёвка', `/tournaments/${t.id}?tab=draw`))
    }
    for (const j of d.judges) {
      await inbox([j.judge.userId], 'judge.assigned',
        { tournament: t.name, round: round.name, room: d.room, chair: j.isChair, proposition: d.proposition.name, opposition: d.opposition.name }, `/ballot/${d.id}`)
      await notifyUsers([j.judge.userId], () =>
        withLink(`${head}\n\n⚖️ Вы ${j.isChair ? '<b>председатель</b>' : 'боковой судья'} в аудитории <b>${esc(d.room)}</b>\n«${esc(d.proposition.name)}» vs «${esc(d.opposition.name)}»${motion}`,
          'Заполнить бюллетень', `/ballot/${d.id}`))
    }
  }
}

// a round was completed: speakers learn their result
export async function notifyRoundCompleted(roundId: string) {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      tournament: { select: { id: true, name: true } },
      debates: { include: { proposition: { include: { speakers: { select: { userId: true } } } }, opposition: { include: { speakers: { select: { userId: true } } } } } },
    },
  })
  if (!round) return
  for (const d of round.debates) {
    for (const [side, team] of [['proposition', d.proposition], ['opposition', d.opposition]] as const) {
      await inbox(team.speakers.map(s => s.userId), 'participant.roundResult',
        { tournament: round.tournament.name, round: round.name, result: d.winner === side ? 'win' : 'loss' }, `/tournaments/${round.tournament.id}?tab=results`)
    }
  }
}

// a team applied: the tournament's organizers should review it
export async function notifyNewRegistration(regId: string) {
  const r = await prisma.teamRegistration.findUnique({ where: { id: regId }, include: { tournament: { select: { id: true, name: true } } } })
  if (!r) return
  const to = await organizersOf(r.tournamentId)
  const link = `/dashboard/tournaments/${r.tournamentId}/registrations`
  await inbox(to, 'organizer.newRegistration', { tournament: r.tournament.name, team: r.teamName }, link)
  await notifyUsers(to, () => withLink(`📝 Новая заявка на <b>${esc(r.tournament.name)}</b>: команда «${esc(r.teamName)}»`, 'Заявки', link))
}

export async function notifyRegistration(regId: string) {
  const r = await prisma.teamRegistration.findUnique({ where: { id: regId }, include: { tournament: { select: { id: true, name: true } } } })
  if (!r || r.status === 'pending') return
  const ok = r.status === 'confirmed'
  await inbox([r.userId], ok ? 'participant.registrationConfirmed' : 'participant.registrationRejected',
    { tournament: r.tournament.name, team: r.teamName }, `/tournaments/${r.tournament.id}`)
  await notifyUsers([r.userId], () => withLink(
    ok ? `✅ Заявка команды «${esc(r.teamName)}» на турнир <b>${esc(r.tournament.name)}</b> подтверждена. Удачи!`
      : `❌ Заявка команды «${esc(r.teamName)}» на турнир <b>${esc(r.tournament.name)}</b> отклонена организатором.`,
    'Турнир', `/tournaments/${r.tournament.id}`))
}

// someone accepted an invite: the other organizers see who joined; a new judge gets a welcome
export async function notifyJoined(tournamentId: string, userId: string, kind: 'judge' | 'co_organizer') {
  const [t, u] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ])
  if (!t || !u) return
  const others = (await organizersOf(tournamentId)).filter(id => id !== userId)
  await inbox(others, 'organizer.memberJoined', { tournament: t.name, name: u.name, kind }, `/dashboard/tournaments/${tournamentId}${kind === 'judge' ? '/judges' : ''}`)
  if (kind === 'judge') await inbox([userId], 'judge.joined', { tournament: t.name }, '/judge')
}

// admin decisions reach the organizers of the tournament
export async function notifyModeration(tournamentId: string, name: string, decision: 'approved' | 'rejected' | 'deleted', reason?: string) {
  const to = await organizersOf(tournamentId)
  // a deleted tournament has no page any more
  const link = decision === 'deleted' ? undefined : `/dashboard/tournaments/${tournamentId}`
  await inbox(to, `organizer.${decision}`, { tournament: name, ...(reason && { reason }) }, link)
  const text = decision === 'approved' ? `✅ Турнир «${esc(name)}» одобрен и опубликован.`
    : decision === 'rejected' ? `❌ Турнир «${esc(name)}» отклонён. Причина: ${esc(reason ?? '')}`
      : `🗑 Турнир «${esc(name)}» удалён администратором. Причина: ${esc(reason ?? '')}`
  await notifyUsers(to, () => (link ? withLink(text, 'Управление турниром', link) : [text]))
}

// platform events for every admin: a tournament waits for review (and for payment if it is Pro)
export async function notifyAdminsNewTournament(tournamentId: string) {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { organizers: { where: { role: 'owner' }, include: { user: { select: { name: true } } } } },
  })
  if (!t || t.moderation !== 'pending') return
  await inbox(await admins(), 'admin.tournamentPending', { tournament: t.name, owner: t.organizers[0]?.user.name ?? '', city: t.city, pro: t.plan === 'pro' }, '/admin')
}
