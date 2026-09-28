import type { Prisma } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { linkable, sendMessage, telegramEnabled, TelegramError, type InlineButton, type SendOptions } from '../lib/telegram.js'
import { asLang, buttonLabel, renderNotification } from './botTexts.js'
import { getStandings } from './tournaments.js'

// Notifications. Every event lands in the in-app notification centre (type + data, rendered in RU/KZ on the site)
// and, for people who linked the bot themselves, is also sent to Telegram — the same type rendered by botTexts.ts
// in the language of each person. Recipients follow per-tournament rights: speakers, judges, organizers of that
// tournament; admins get platform events. Sending never breaks the request that triggered it: call with background().

export function background(p: Promise<unknown>) {
  p.catch(e => console.error('[notify]', e instanceof Error ? e.message : e))
}

const site = (path: string) => `${env.CLIENT_ORIGIN}${path}`
const pause = (ms: number) => new Promise(r => setTimeout(r, ms))

// a link as a button when Telegram accepts it (public https), otherwise as a line of text
export function withLink(text: string, label: string, path: string, extra: InlineButton[][] = []): [string, SendOptions] {
  const url = site(path)
  if (linkable(url)) return [text, { buttons: [[{ text: label, url }], ...extra] }]
  return [`${text}\n\n${label}: ${url}`, extra.length ? { buttons: extra } : {}]
}

type Data = Prisma.InputJsonObject
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))]

export async function inbox(userIds: (string | null | undefined)[], type: string, data: Data, link?: string) {
  const to = uniq(userIds)
  if (to.length) await prisma.notification.createMany({ data: to.map(userId => ({ userId, type, data, link })) })
}

// Telegram copy of a notification, for people who linked the bot and did not mute it
async function telegram(userIds: (string | null | undefined)[], type: string, data: Data, link?: string) {
  if (!telegramEnabled()) return
  const ids = uniq(userIds)
  if (!ids.length) return
  const users = await prisma.user.findMany({ where: { id: { in: ids }, telegramChatId: { not: null }, telegramNotify: true, blocked: false } })
  for (const [i, u] of users.entries()) {
    const lang = asLang(u.language)
    const text = renderNotification(type, data as Record<string, unknown>, lang)
    if (!text) continue
    const [body, opts] = link ? withLink(text, buttonLabel(type, lang), link) : [text, {}]
    try {
      await sendMessage(u.telegramChatId!, body, opts)
    } catch (e) {
      // the person blocked the bot or deleted the chat: stop trying
      if (e instanceof TelegramError && (e.code === 403 || /chat not found/i.test(e.message))) {
        await prisma.user.update({ where: { id: u.id }, data: { telegramChatId: null } })
      } else console.error('[notify] telegram:', e instanceof Error ? e.message : e)
    }
    // Telegram allows about 30 messages a second per bot: a published round can reach hundreds of people
    if (i < users.length - 1 && env.NODE_ENV !== 'test') await pause(40)
  }
}

// one event: the notification centre and Telegram
export async function notify(userIds: (string | null | undefined)[], type: string, data: Data, link?: string) {
  await inbox(userIds, type, data, link)
  await telegram(userIds, type, data, link)
}

export const organizersOf = async (tournamentId: string) =>
  (await prisma.tournamentOrganizer.findMany({ where: { tournamentId }, select: { userId: true } })).map(o => o.userId)
export const admins = async () => (await prisma.user.findMany({ where: { role: 'admin', blocked: false }, select: { id: true } })).map(u => u.id)

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
  for (const d of round.debates) {
    for (const [side, team, other] of [['proposition', d.proposition, d.opposition], ['opposition', d.opposition, d.proposition]] as const) {
      await notify(team.speakers.map(s => s.userId), 'participant.drawReleased',
        { tournament: t.name, round: round.name, room: d.room, side, opponent: other.name, motion: round.motion }, `/tournaments/${t.id}?tab=draw`)
    }
    for (const j of d.judges) {
      await notify([j.judge.userId], 'judge.assigned',
        { tournament: t.name, round: round.name, room: d.room, chair: j.isChair, proposition: d.proposition.name, opposition: d.opposition.name, motion: round.motion }, `/ballot/${d.id}`)
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
      await notify(team.speakers.map(s => s.userId), 'participant.roundResult',
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
  await notify(to, 'organizer.newRegistration', { tournament: r.tournament.name, team: r.teamName }, link)
}

export async function notifyRegistration(regId: string) {
  const r = await prisma.teamRegistration.findUnique({ where: { id: regId }, include: { tournament: { select: { id: true, name: true } } } })
  if (!r || r.status === 'pending') return
  const ok = r.status === 'confirmed'
  await notify([r.userId], ok ? 'participant.registrationConfirmed' : 'participant.registrationRejected',
    { tournament: r.tournament.name, team: r.teamName }, `/tournaments/${r.tournament.id}`)
}

// someone accepted an invite: the other organizers see who joined; a new judge gets a welcome
export async function notifyJoined(tournamentId: string, userId: string, kind: 'judge' | 'co_organizer') {
  const [t, u] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ])
  if (!t || !u) return
  const others = (await organizersOf(tournamentId)).filter(id => id !== userId)
  await notify(others, 'organizer.memberJoined', { tournament: t.name, name: u.name, kind }, `/dashboard/tournaments/${tournamentId}${kind === 'judge' ? '/judges' : ''}`)
  if (kind === 'judge') await notify([userId], 'judge.joined', { tournament: t.name }, '/judge')
}

// admin decisions reach the organizers of the tournament
export async function notifyModeration(tournamentId: string, name: string, decision: 'approved' | 'rejected' | 'deleted', reason?: string) {
  const to = await organizersOf(tournamentId)
  // a deleted tournament has no page any more
  const link = decision === 'deleted' ? undefined : `/dashboard/tournaments/${tournamentId}`
  await notify(to, `organizer.${decision}`, { tournament: name, ...(reason && { reason }) }, link)
}

// platform events for every admin: a tournament waits for review (and for payment if it is Pro)
export async function notifyAdminsNewTournament(tournamentId: string) {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { organizers: { where: { role: 'owner' }, include: { user: { select: { name: true } } } } },
  })
  if (!t || t.moderation !== 'pending') return
  await notify(await admins(), 'admin.tournamentPending', { tournament: t.name, owner: t.organizers[0]?.user.name ?? '', city: t.city, pro: t.plan === 'pro' }, '/admin')
}

// the tournament is over: every speaker learns their team's place, judges and speakers that the certificate is ready,
// the organizers who won
export async function notifyTournamentFinished(tournamentId: string) {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, name: true, breakSize: true, teams: { where: { swing: false }, select: { id: true, name: true, speakers: { select: { userId: true } } } }, judges: { select: { userId: true } } },
  })
  if (!t) return
  const st = await getStandings(tournamentId)
  const place = new Map(st.teams.map(r => [r.team.id, r.rank]))
  for (const team of t.teams) {
    const p = place.get(team.id)
    if (!p) continue
    await notify(team.speakers.map(s => s.userId), 'participant.tournamentFinished',
      { tournament: t.name, team: team.name, place: p, teams: st.teams.length, inBreak: p <= t.breakSize }, '/me?tab=certificates')
  }
  await notify(t.judges.map(j => j.userId), 'judge.tournamentFinished', { tournament: t.name }, '/me?tab=certificates')
  await notify(await organizersOf(t.id), 'organizer.tournamentFinished',
    { tournament: t.name, winner: st.teams[0]?.team.name ?? '', teams: st.teams.length }, `/dashboard/tournaments/${t.id}/results`)
}
