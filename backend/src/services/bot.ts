import type { User } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { hashToken } from '../lib/tokens.js'
import { answerCallback, editMessage, esc, linkable, sendMessage, type InlineButton, type TgCallback, type TgMessage, type TgUpdate } from '../lib/telegram.js'
import { asLang, fromTelegram, LANGS, T, type Lang } from './botTexts.js'
import { campNames, sideLabel, sidesInDebate } from './formats.js'
import { motionFor } from './tournaments.js'
import { continueDialog, endDialog, flowCallback, greet, onApply, onCheckin, onClub, onLoginLink, startRegistration } from './botFlows.js'
import { F } from './botFlowTexts.js'
import { M, menuCommand, menuOptions } from './botMenuTexts.js'
import { menuCallback, onFind, onResults, onTournamentCard, sendMenu } from './botMenu.js'
import { growthCallback, onInlineQuery, onSubscribe } from './botGrowth.js'

// Telegram bot logic (transport-independent: fed by long polling, or by e2e in test mode).
// Private chats only. Linking: the site creates a one-time token -> t.me/<bot>?start=<token>.
// The bot speaks the person's language (Russian or Kazakh): the site's switch, /lang, or Telegram's own language.

// KZ numbers only (+7 7xx): the platform is for Kazakhstan
export function normalizePhone(raw: string) {
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`
  if (d.length !== 11 || !d.startsWith('77')) return null
  return `+${d}`
}
const pretty = (p: string) => `${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5, 8)} ${p.slice(8, 10)} ${p.slice(10)}`
const site = (path: string) => `${env.CLIENT_ORIGIN}${path}`

const linkedUser = (chatId: number) => prisma.user.findUnique({ where: { telegramChatId: String(chatId) } })
const langOf = (u: User) => asLang(u.language)

// the settings under /me and /lang: language and notifications, changed with one tap
const langButtons = (): InlineButton[] => LANGS.map(l => ({ text: l === 'kz' ? '🇰🇿 Қазақша' : 'Русский', callback_data: `lang:${l}` }))
const settingsButtons = (u: User): InlineButton[][] => [
  langButtons(),
  [u.telegramNotify ? { text: T[langOf(u)].turnOff, callback_data: 'notify:off' } : { text: T[langOf(u)].turnOn, callback_data: 'notify:on' }],
  [{ text: M[langOf(u)].subscribeButton, callback_data: 'sb:show' }],
]
const meText = (u: User) => T[langOf(u)].me(u.name, !!u.phoneVerifiedAt, u.telegramNotify)

async function onStart(msg: TgMessage, token: string | undefined) {
  const chat = String(msg.chat.id)
  const current = await linkedUser(msg.chat.id)
  const guess = current ? langOf(current) : fromTelegram(msg.from?.language_code)
  // "Sign in with Telegram" on the site, and "Sign up in Telegram" from the sign-up page
  if (token?.startsWith('login_')) return onLoginLink(msg, token.slice('login_'.length), current)
  // "subscribe to new tournaments" from the site, and a tournament's card shared in a chat (start=t_<id>)
  if (token === 'subscribe') return onSubscribe(chat, guess)
  if (token?.startsWith('t_')) return onTournamentCard(chat, guess, current, token.slice(2))
  if (token === 'register') {
    if (current) return sendMessage(chat, F[guess].alreadyRegistered(current.name))
    return startRegistration(chat, guess)
  }
  if (!token) {
    if (current) return sendMessage(chat, `${T[guess].alreadyLinked(current.name)}\n\n${T[guess].help}`, menuOptions(guess))
    return greet(msg)
  }
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } })
  if (!row || row.purpose !== 'telegram_link' || row.usedAt || row.expiresAt < new Date()) return sendMessage(chat, T[guess].linkExpired)
  const l = langOf(row.user)
  if (row.user.blocked) return sendMessage(chat, T[l].blocked)
  // one Telegram account belongs to one site account
  if (current && current.id !== row.userId) return sendMessage(chat, T[l].otherAccount(current.name))
  const user = await prisma.$transaction(async tx => {
    await tx.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } })
    return tx.user.update({ where: { id: row.userId }, data: { telegramChatId: chat, telegramUsername: msg.from?.username ?? null, telegramNotify: true } })
  })
  await sendMessage(chat, `${T[l].linked(user.name)}\n\n${T[l].help}`, { buttons: [langButtons()] })
  // a reply keyboard cannot sit under a message with inline buttons: the phone request (or the menu) goes separately
  if (!user.phoneVerifiedAt) await sendMessage(chat, T[l].askPhone, { requestContact: T[l].sharePhone })
  else await sendMenu(chat, l)
}

async function onContact(msg: TgMessage, user: User) {
  const chat = String(msg.chat.id)
  const t = T[langOf(user)]
  const c = msg.contact!
  // only your own contact counts (a forwarded contact card has someone else's user_id or none)
  if (!msg.from || c.user_id !== msg.from.id) return sendMessage(chat, t.ownContact, { requestContact: t.sharePhone })
  const phone = normalizePhone(c.phone_number)
  // the phone keyboard gives way to the main menu
  const menu = menuOptions(langOf(user))
  if (!phone) return sendMessage(chat, t.kzOnly, menu)
  const other = await prisma.user.findUnique({ where: { verifiedPhone: phone } })
  if (other && other.id !== user.id) return sendMessage(chat, t.phoneTaken, menu)
  await prisma.user.update({ where: { id: user.id }, data: { verifiedPhone: phone, phoneVerifiedAt: new Date(), phone: pretty(phone) } })
  return sendMessage(chat, t.phoneOk(pretty(phone)), menu)
}

// /next: what matters right now — the published draw for a speaker, ballots for a judge, new applications for an organizer
async function onNext(chat: string, user: User) {
  const t = T[langOf(user)]
  const live = { round: { status: 'released' as const } }
  const [speaking, judging, organizing] = await Promise.all([
    prisma.debate.findMany({
      where: {
        ...live,
        OR: (['proposition', 'opposition', 'closingProposition', 'closingOpposition'] as const).map(side => ({ [side]: { speakers: { some: { userId: user.id } } } })),
      },
      include: {
        round: { include: { tournament: { select: { id: true, name: true } } } },
        proposition: { include: { speakers: { select: { userId: true } } } }, opposition: { include: { speakers: { select: { userId: true } } } },
        closingProposition: { include: { speakers: { select: { userId: true } } } }, closingOpposition: { include: { speakers: { select: { userId: true } } } },
      },
      orderBy: { round: { date: 'desc' } }, take: 5,
    }),
    prisma.debateJudge.findMany({
      where: { judge: { userId: user.id }, debate: live },
      include: {
        debate: {
          include: {
            round: { include: { tournament: { select: { name: true } } } }, ballots: { select: { judgeId: true } },
            proposition: { select: { name: true, league: true } }, opposition: { select: { name: true } },
            closingProposition: { select: { name: true } }, closingOpposition: { select: { name: true } },
          },
        },
      },
      take: 5,
    }),
    prisma.tournament.findMany({
      where: { organizers: { some: { userId: user.id } }, status: { not: 'finished' }, registrations: { some: { status: 'pending' } } },
      select: { id: true, name: true, _count: { select: { registrations: { where: { status: 'pending' } } } } },
      take: 5,
    }),
  ])
  const parts: [string, string, string][] = [] // text, button label, path
  for (const d of speaking) {
    const teams = { proposition: d.proposition, opposition: d.opposition, closingProposition: d.closingProposition, closingOpposition: d.closingOpposition }
    const inRoom = sidesInDebate(d)
    const mine = inRoom.find(x => teams[x.side]!.speakers.some(s => s.userId === user.id))!.side
    parts.push([t.nextSpeaker({
      tournament: d.round.tournament.name, round: d.round.name, room: d.room, side: sideLabel(mine, inRoom.length === 4),
      opponent: inRoom.filter(x => x.side !== mine).map(x => teams[x.side]!.name).join(', '), motion: motionFor(d.round, d.proposition.league), online: d.onlineUrl ?? undefined,
    }), t.open, `/tournaments/${d.round.tournament.id}?tab=draw`])
  }
  for (const j of judging) {
    const d = j.debate
    parts.push([t.nextJudge({
      tournament: d.round.tournament.name, round: d.round.name, room: d.room, chair: j.isChair,
      ...campNames(d), motion: motionFor(d.round, d.proposition.league), online: d.onlineUrl ?? undefined, submitted: d.ballots.some(b => b.judgeId === j.judgeId),
    }), t.open, `/ballot/${d.id}`])
  }
  for (const o of organizing) parts.push([t.nextOrganizer({ tournament: o.name, count: o._count.registrations }), t.open, `/dashboard/tournaments/${o.id}/registrations`])
  // an organizer on the tournament day: the round, the ballots and check-in in one tap
  const running = await prisma.tournament.findMany({ where: { status: 'ongoing', organizers: { some: { userId: user.id } } }, select: { id: true, name: true }, take: 5 })
  const m = M[langOf(user)]
  for (const x of running) await sendMessage(chat, m.nextDay(x.name), { buttons: [[{ text: m.dayButton, callback_data: `td:${x.id}` }, { text: m.announceButton, callback_data: `an:${x.id}` }]] })
  if (!parts.length && !running.length) return sendMessage(chat, t.nothingNow)
  // one message per item, each with its own button: a judge opens the ballot in one tap
  for (const [text, label, path] of parts) {
    const url = site(path)
    await sendMessage(chat, linkable(url) ? text : `${text}\n${url}`, linkable(url) ? { buttons: [[{ text: label, url }]] } : {})
  }
}

// /tournaments: every tournament that is not finished, with the person's role in it
async function onTournaments(chat: string, user: User) {
  const t = T[langOf(user)]
  const active = { status: { not: 'finished' as const } }
  const [org, judge, speaker, applied] = await Promise.all([
    prisma.tournament.findMany({ where: { ...active, organizers: { some: { userId: user.id } } }, select: { id: true, name: true } }),
    prisma.tournament.findMany({ where: { ...active, judges: { some: { userId: user.id } } }, select: { id: true, name: true } }),
    prisma.tournament.findMany({ where: { ...active, teams: { some: { speakers: { some: { userId: user.id } } } } }, select: { id: true, name: true } }),
    prisma.tournament.findMany({ where: { ...active, registrations: { some: { userId: user.id, status: { not: 'rejected' } } } }, select: { id: true, name: true } }),
  ])
  const rows = new Map<string, { name: string; roles: Set<string> }>()
  const add = (list: { id: string; name: string }[], role: string) => {
    for (const x of list) {
      const row = rows.get(x.id) ?? { name: x.name, roles: new Set<string>() }
      row.roles.add(role)
      rows.set(x.id, row)
    }
  }
  add(org, 'organizer')
  add(judge, 'judge')
  add([...speaker, ...applied], 'speaker')
  if (!rows.size) return sendMessage(chat, t.noTournaments, { buttons: [[{ text: M[langOf(user)].menu.find, callback_data: 'find:0' }]] })
  const list = [...rows.entries()].slice(0, 15)
  const lines = list.map(([, r]) => `• <b>${esc(r.name)}</b> — ${[...r.roles].map(x => t.asRole[x]).join(', ')}`)
  // one button per tournament: it opens the tournament's card (table, draw, site page)
  return sendMessage(chat, [t.tournamentsHead, '', ...lines].join('\n'), {
    buttons: list.map(([id, r]) => [{ text: r.name.length > 40 ? `${r.name.slice(0, 39)}…` : r.name, callback_data: `tc:${id}` }]),
  })
}

// taps on the inline buttons: language and notifications
async function onCallback(cb: TgCallback) {
  const user = await linkedUser(cb.from.id)
  const chat = String(cb.from.id)
  // the dialogs' buttons (sign-up, sign-in, club, application, check-in)
  if (cb.data && await flowCallback(chat, cb.data, user, cb.from.language_code, cb.message?.message_id)) return answerCallback(cb.id)
  // the menu's buttons: finding a tournament, its card and table, an organizer's decision on an application
  if (cb.data === 'menu:next' && user) { await answerCallback(cb.id); return onNext(chat, user) }
  if (cb.data && await growthCallback(chat, cb.data, user, cb.from.language_code)) return answerCallback(cb.id)
  if (cb.data && await menuCallback(chat, cb.data, user, user ? langOf(user) : fromTelegram(cb.from.language_code), cb.message)) return answerCallback(cb.id)
  if (!user) {
    await answerCallback(cb.id)
    return sendMessage(chat, T[fromTelegram(cb.from.language_code)].linkFirst(site('/me')))
  }
  let u = user
  let note: string
  if (cb.data?.startsWith('lang:')) {
    const language: Lang = asLang(cb.data.slice(5))
    u = await prisma.user.update({ where: { id: user.id }, data: { language } })
    note = T[language].langSet
  } else if (cb.data === 'notify:on' || cb.data === 'notify:off') {
    u = await prisma.user.update({ where: { id: user.id }, data: { telegramNotify: cb.data === 'notify:on' } })
    note = u.telegramNotify ? T[langOf(u)].notifyOn : T[langOf(u)].notifyOff
  } else {
    return answerCallback(cb.id)
  }
  await answerCallback(cb.id, note)
  // the menu under /me redraws itself in the new state; other messages just get the short confirmation
  if (cb.message?.text?.startsWith(user.name)) await editMessage(chat, cb.message.message_id, meText(u), { buttons: settingsButtons(u) }).catch(() => undefined)
  else await sendMessage(chat, note)
}

// "/next@DebateKzBot" in a group-style command form is the same command
const command = (text: string) => text.split(/\s+/)[0].replace(/@\w+$/, '').toLowerCase()

export async function handleUpdate(update: TgUpdate) {
  if (update.inline_query) return onInlineQuery(update.inline_query)
  if (update.callback_query) return onCallback(update.callback_query)
  const msg = update.message
  if (!msg || msg.chat.type !== 'private') return // groups are ignored
  const chat = String(msg.chat.id)
  // a tap on the main menu is its command
  const raw = msg.text?.trim() ?? ''
  const fromMenu = menuCommand(raw)
  const text = fromMenu ? `/${fromMenu}` : raw
  if (command(text) === '/start') { await endDialog(chat); return onStart(msg, text.split(/\s+/)[1]) }
  const user = await linkedUser(msg.chat.id)
  // a command leaves an open dialog; anything else is the dialog's answer
  if (text.startsWith('/')) await endDialog(chat)
  else if (await continueDialog(msg, user)) return
  // finding a tournament needs no account
  if (!user && command(text) === '/find') return onFind(chat, fromTelegram(msg.from?.language_code), null)
  if (!user && command(text) === '/subscribe') return onSubscribe(chat, fromTelegram(msg.from?.language_code))
  if (!user) return greet(msg)
  const l = langOf(user), t = T[l]
  if (msg.contact) return onContact(msg, user)
  switch (command(text)) {
    case '/cancel': return sendMessage(chat, F[l].cancelled, menuOptions(l))
    case '/menu': return sendMenu(chat, l)
    case '/find': return onFind(chat, l, user)
    case '/results': return onResults(chat, user)
    case '/subscribe': return onSubscribe(chat, l)
    case '/apply': return onApply(chat, user)
    case '/club': return onClub(chat, user)
    case '/checkin': return onCheckin(chat, user)
    case '/help': return sendMessage(chat, t.help, menuOptions(l))
    case '/me':
      await sendMessage(chat, meText(user), { buttons: settingsButtons(user) })
      // a reply keyboard cannot sit under the same message as inline buttons: the phone request goes separately
      if (!user.phoneVerifiedAt) await sendMessage(chat, t.askPhone, { requestContact: t.sharePhone })
      return
    case '/lang': return sendMessage(chat, t.langPick, { buttons: [langButtons()] })
    case '/next': return onNext(chat, user)
    case '/tournaments': return onTournaments(chat, user)
    case '/stop':
      await prisma.user.update({ where: { id: user.id }, data: { telegramNotify: false } })
      return sendMessage(chat, t.notifyOff)
    case '/on':
      await prisma.user.update({ where: { id: user.id }, data: { telegramNotify: true } })
      return sendMessage(chat, t.notifyOn)
    default:
      return sendMessage(chat, `${t.unknown}\n\n${t.help}`, menuOptions(l))
  }
}

// the "/" menu in Telegram, in each language
export const botCommands = (l: Lang) => ['menu', 'next', 'find', 'apply', 'checkin', 'tournaments', 'results', 'club', 'subscribe', 'me', 'lang', 'stop', 'on', 'help'].map(command => ({ command, description: T[l].commands[command] }))
