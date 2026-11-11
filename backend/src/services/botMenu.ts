import type { User } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { todayKz, toDay } from '../lib/dates.js'
import { editMessage, linkable, sendMessage, type InlineButton, type SendOptions } from '../lib/telegram.js'
import { asLang, T, type Lang } from './botTexts.js'
import { M, menuOptions, type ResultRow } from './botMenuTexts.js'
import { asUser, explain } from './botApi.js'
import { applyTo } from './botFlows.js'
import { cachedStandings, getStandings, isOrganizerOf, isPublic, publicWhere } from './tournaments.js'
import { hiddenRoundIds } from './silent.js'
import { isBP } from './formats.js'
import { publicProfile } from './people.js'

// The bot's main menu and what it opens: finding a tournament, a tournament's card and table, the person's results,
// an organizer's decision on an application. Reading is done here; anything that changes data goes through the
// site's API (botApi.asUser), like the dialogs.

const site = (path: string) => `${env.CLIENT_ORIGIN}${path}`
const PAGE = 5

export { menuOptions }
export const sendMenu = (chat: string, l: Lang, text = M[l].menuShown) => sendMessage(chat, text, menuOptions(l))

// a site link as a button (public https) or, on localhost, as a line of the text
function siteButton(text: string, label: string, path: string, rows: InlineButton[][]): [string, SendOptions] {
  const url = site(path)
  if (linkable(url)) return [text, { buttons: [...rows, [{ text: label, url }]] }]
  return [`${text}\n${url}`, rows.length ? { buttons: rows } : {}]
}

const dm = (d: Date) => toDay(d).split('-').reverse().slice(0, 2).join('.')
const dates = (a: Date, b: Date) => (toDay(a) === toDay(b) ? `${dm(a)}.${toDay(a).slice(0, 4)}` : `${dm(a)} – ${dm(b)}.${toDay(b).slice(0, 4)}`)

type CardRow = Awaited<ReturnType<typeof findCards>>[number]
const cardSelect = {
  id: true, name: true, city: true, venue: true, startDate: true, endDate: true, format: true, level: true, status: true, maxTeams: true,
  registrationDeadline: true, registrationOpen: true, kind: true, registrationUrl: true, organizerName: true,
  _count: { select: { teams: { where: { swing: false } } } },
} as const
const findCards = (where: object, skip = 0, take = PAGE) =>
  prisma.tournament.findMany({ where: { ...publicWhere, ...where }, select: cardSelect, orderBy: [{ status: 'asc' }, { startDate: 'asc' }], skip, take })

const deadlinePassed = (t: Pick<CardRow, 'registrationDeadline'>) => !!t.registrationDeadline && toDay(t.registrationDeadline) < todayKz()
const canApply = (t: CardRow) => t.status === 'registration' && t.registrationOpen && t.kind !== 'local' && !deadlinePassed(t)

function cardText(t: CardRow, l: Lang) {
  const m = M[l]
  return m.card({
    name: t.name, dates: dates(t.startDate, t.endDate), city: t.city, venue: t.venue ?? undefined, format: m.format[t.format] ?? t.format,
    level: m.level[t.level] ?? t.level, status: m.status[t.status] ?? t.status, teams: t._count.teams, maxTeams: t.maxTeams,
    deadline: t.status === 'registration' && t.registrationDeadline && !deadlinePassed(t) ? dm(t.registrationDeadline) : undefined,
    organizer: t.organizerName,
  })
}

// ---------- 🔎 find a tournament ----------

// the nearest public tournaments: those taking applications first, then the ones going on now
export async function onFind(chat: string, l: Lang, user: User | null, skip = 0) {
  const m = M[l]
  const where = { status: { in: ['registration' as const, 'ongoing' as const] }, endDate: { gte: new Date(`${todayKz()}T00:00:00Z`) } }
  const [total, list] = await Promise.all([prisma.tournament.count({ where: { ...publicWhere, ...where } }), findCards(where, skip)])
  if (!total) return sendMessage(chat, m.findNone)
  if (!skip) await sendMessage(chat, m.findHead(total))
  for (const t of list) {
    const row: InlineButton[] = [{ text: m.details, callback_data: `tc:${t.id}` }]
    if (canApply(t)) row.unshift({ text: user ? m.apply : m.register, callback_data: user ? `ta:${t.id}` : 'reg:start' })
    await sendMessage(chat, cardText(t, l), { buttons: [row] })
  }
  if (skip + PAGE < total) await sendMessage(chat, '⬇️', { buttons: [[{ text: m.more, callback_data: `find:${skip + PAGE}` }]] })
}

// ---------- a tournament's card ----------

async function rolesIn(userId: string, tournamentId: string) {
  const [org, judge, speaker] = await Promise.all([
    prisma.tournamentOrganizer.count({ where: { tournamentId, userId } }),
    prisma.judge.count({ where: { tournamentId, userId } }),
    prisma.speaker.count({ where: { userId, team: { tournamentId, swing: false } } }),
  ])
  return [org && 'organizer', judge && 'judge', speaker && 'speaker'].filter((x): x is string => !!x)
}

export async function onTournamentCard(chat: string, l: Lang, user: User | null, id: string) {
  const m = M[l]
  const t = await prisma.tournament.findUnique({ where: { id }, select: { ...cardSelect, visible: true, moderation: true, abandonedAt: true } })
  const roles = user && t ? await rolesIn(user.id, id) : []
  // a hidden tournament only for its own people
  if (!t || (!isPublic(t) && !roles.length)) return sendMessage(chat, m.notFound)
  const lines = [cardText(t, l)]
  if (roles.length) lines.push('', m.yourRole(roles.map(r => T[l].asRole[r]).join(', ')))
  if (t.status === 'ongoing') {
    const round = await prisma.round.findFirst({ where: { tournamentId: id, status: { not: 'draft' } }, orderBy: { number: 'desc' }, select: { name: true } })
    if (round) lines.push(m.currentRound(round.name))
  }
  if (t.kind === 'local' && t.registrationUrl && t.status === 'registration') lines.push('', m.outside(t.registrationUrl))
  const rows: InlineButton[][] = []
  if (canApply(t)) rows.push([{ text: user ? m.apply : m.register, callback_data: user ? `ta:${t.id}` : 'reg:start' }])
  if (t.status !== 'registration') rows.push([{ text: m.table, callback_data: `tt:${t.id}` }, ...(user && t.status === 'ongoing' && roles.some(r => r !== 'organizer') ? [{ text: m.myDraw, callback_data: 'menu:next' }] : [])])
  const [text, opts] = siteButton(lines.join('\n'), m.onSite, roles.includes('organizer') ? `/dashboard/tournaments/${id}` : `/tournaments/${id}`, rows)
  return sendMessage(chat, text, opts)
}

// ---------- 📋 a tournament's table ----------

export async function onTable(chat: string, l: Lang, user: User | null, id: string) {
  const m = M[l]
  const t = await prisma.tournament.findUnique({ where: { id }, select: { name: true, format: true, visible: true, moderation: true, abandonedAt: true } })
  const organizer = !!user && !!t && await isOrganizerOf(user, id)
  if (!t || (!isPublic(t) && !organizer)) return sendMessage(chat, m.notFound)
  // silent rounds stay out of the table until the break, like on the site; organizers see the real one
  const hide = organizer ? new Set<string>() : await hiddenRoundIds(id)
  const st = organizer ? await getStandings(id) : await cachedStandings(id, hide)
  const played = st.teams.some(r => r.wins + r.losses > 0)
  if (!played) return sendMessage(chat, `${m.tableHead(t.name, isBP(t.format))}\n\n${m.tableNone}`)
  const mine = user ? new Set((await prisma.speaker.findMany({ where: { userId: user.id, team: { tournamentId: id } }, select: { teamId: true } })).map(x => x.teamId)) : new Set<string>()
  const line = (r: (typeof st.teams)[number]) => `${r.rank}. ${mine.has(r.team.id) ? '<b>' : ''}${escName(r.team.name)}${mine.has(r.team.id) ? '</b>' : ''} — ${r.points} · ${r.speakerPoints}${mine.has(r.team.id) ? ` ${m.yourTeam}` : ''}`
  const top = st.teams.slice(0, 12)
  const lines = top.map(line)
  // the person's team below the top: "…" and its row
  for (const r of st.teams.slice(12)) if (mine.has(r.team.id)) lines.push('…', line(r))
  const note = hide.size ? `\n\n<i>${m.tableHidden}</i>` : ''
  const [text, opts] = siteButton(`${m.tableHead(t.name, isBP(t.format))}\n\n${lines.join('\n')}${note}`, m.onSite, `/tournaments/${id}?tab=results`, [])
  return sendMessage(chat, text, opts)
}
const escName = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ---------- 📊 my results ----------

export async function onResults(chat: string, user: User) {
  const l = asLang(user.language), m = M[l]
  const p = await publicProfile(user.id, user)
  const rows: ResultRow[] = p.speaker.tournaments.slice(0, 8).map(x => ({
    name: x.name, date: x.startDate.split('-').reverse().join('.'), team: x.team, place: x.place, teams: x.teams, inBreak: x.inBreak,
    speakerRank: 'speakerRank' in x ? x.speakerRank : undefined, average: 'average' in x ? x.average : undefined, live: x.status !== 'finished',
  }))
  if (!rows.length && !p.judge.rounds) return sendMessage(chat, m.resultsNone, menuOptions(l))
  const lines = [m.resultsHead]
  if (rows.length) lines.push(m.resultsTotal(p.speaker.tournaments.length, p.speaker.debates, p.speaker.wins), '', ...rows.map(m.resultRow))
  if (p.judge.rounds) lines.push('', m.judgeLine(p.judge.rounds, p.judge.chaired))
  const url = site('/me?tab=certificates')
  const buttons: InlineButton[][] = linkable(url) ? [[{ text: m.certificates, url }, { text: m.profile, url: site(`/people/${user.id}`) }]] : []
  return sendMessage(chat, linkable(url) ? lines.join('\n') : `${lines.join('\n')}\n\n${url}`, buttons.length ? { buttons } : {})
}

// ---------- an organizer decides on an application from the notification ----------

async function decideRegistration(chat: string, user: User, regId: string, status: string, message?: { message_id: number; text?: string }) {
  const l = asLang(user.language), m = M[l]
  const r = await asUser(user, 'PATCH', `/registrations/${regId}`, { status })
  const note = r.ok ? m.regDone[status] : r.error === 'already_processed' ? m.regAlready : explain(l, r.error, T[l].open)
  // the notification keeps its text; its buttons give way to what was decided
  if (message?.text) await editMessage(chat, message.message_id, `${escName(message.text)}\n\n${note}`).catch(() => sendMessage(chat, note))
  else await sendMessage(chat, note)
  return note
}

// ---------- taps ----------

// the menu's inline buttons: true when handled here
export async function menuCallback(chat: string, data: string, user: User | null, l: Lang, message?: { message_id: number; text?: string }) {
  if (data.startsWith('find:')) { await onFind(chat, l, user, Math.max(0, Number(data.slice(5)) || 0)); return true }
  if (data.startsWith('tc:')) { await onTournamentCard(chat, l, user, data.slice(3)); return true }
  if (data.startsWith('tt:')) { await onTable(chat, l, user, data.slice(3)); return true }
  if (!user) return false
  if (data.startsWith('ta:')) { await applyTo(chat, user, data.slice(3)); return true }
  if (data.startsWith('rd:')) {
    const [, regId, status] = data.split(':')
    if (['confirmed', 'waitlisted', 'rejected'].includes(status)) await decideRegistration(chat, user, regId, status, message)
    return true
  }
  return false
}
