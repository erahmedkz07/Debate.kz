import type { User } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { idsContaining } from '../lib/search.js'
import { answerInline, botUsername, linkable, sendMessage, TelegramError, type InlineButton, type TgInlineQuery } from '../lib/telegram.js'
import { asLang, fromTelegram, type Lang } from './botTexts.js'
import { M } from './botMenuTexts.js'
import { asUser, explain } from './botApi.js'
import { cardSelect, cardText, canApply, type CardRow } from './botMenu.js'
import { publicWhere } from './tournaments.js'

// Growth and feedback in the bot:
//   - "tell me about new tournaments": a subscription by city and level (an account is not needed), and the card of
//     each tournament that opens for applications, once;
//   - ratings with one tap: the judges of a debate after the round, the tournament after it ends;
//   - sharing a tournament in any chat: "@bot name" (Telegram's inline mode) puts its card with buttons into the chat.

const site = (path: string) => `${env.CLIENT_ORIGIN}${path}`
const pause = (ms: number) => new Promise(r => setTimeout(r, ms))
// callback_data holds at most 64 bytes
const fits = (data: string) => Buffer.byteLength(data, 'utf8') <= 64

// ---------- 🔔 the subscription ----------

const levelName = (l: Lang, level: string | null) => M[l].subscribeLevels[level ?? 'all']
const where = (l: Lang, city: string | null) => city ?? M[l].anyCity

export async function onSubscribe(chat: string, l: Lang) {
  const m = M[l]
  const sub = await prisma.botSubscriber.findUnique({ where: { chatId: chat } })
  if (sub) {
    return sendMessage(chat, m.subscribeNow(where(l, sub.city), levelName(l, sub.level)), {
      buttons: [[{ text: m.subscribeChange, callback_data: 'sb:city' }, { text: m.subscribeOff, callback_data: 'sb:off' }]],
    })
  }
  return sendMessage(chat, m.subscribeNone, { buttons: [[{ text: m.subscribeStart, callback_data: 'sb:city' }]] })
}

// the cities where tournaments are held (the most active first), and "all cities"
async function cityButtons(l: Lang): Promise<InlineButton[][]> {
  const rows = await prisma.tournament.groupBy({ by: ['city'], where: publicWhere, _count: { city: true }, orderBy: { _count: { city: 'desc' } }, take: 8 })
  const cities = [...new Set(['Астана', 'Алматы', ...rows.map(r => r.city)])].slice(0, 8).filter(c => fits(`sb:c:${c}`))
  const buttons = cities.map(c => ({ text: c, callback_data: `sb:c:${c}` }))
  const out: InlineButton[][] = []
  for (let i = 0; i < buttons.length; i += 2) out.push(buttons.slice(i, i + 2))
  out.push([{ text: M[l].subscribeAllCities, callback_data: 'sb:c:*' }])
  return out
}

export async function subscribeCallback(chat: string, data: string, l: Lang) {
  const m = M[l]
  if (data === 'sb:off') {
    await prisma.botSubscriber.deleteMany({ where: { chatId: chat } })
    return sendMessage(chat, m.subscribeGone)
  }
  if (data === 'sb:city') return sendMessage(chat, m.subscribeCity, { buttons: await cityButtons(l) })
  if (data.startsWith('sb:c:')) {
    const city = data.slice(5)
    const levels = ['school', 'university', 'all'].map(level => ({ text: m.subscribeLevels[level], callback_data: `sb:l:${level}:${city}` })).filter(b => fits(b.callback_data))
    return sendMessage(chat, m.subscribeLevel, { buttons: [levels] })
  }
  if (data.startsWith('sb:l:')) {
    const [, , level, ...rest] = data.split(':')
    const city = rest.join(':')
    const row = { city: city === '*' ? null : city, level: level === 'all' ? null : level, language: l }
    await prisma.botSubscriber.upsert({ where: { chatId: chat }, create: { chatId: chat, ...row }, update: row })
    return sendMessage(chat, m.subscribeDone(where(l, row.city), levelName(l, row.level)), { buttons: [[{ text: m.subscribeOff, callback_data: 'sb:off' }]] })
  }
}

// A tournament opens for applications (approved, registration open): every matching subscriber gets its card, once.
// Called after a moderation decision and after an organizer's change; does nothing for a tournament already announced.
export async function notifySubscribers(tournamentId: string) {
  const t = await prisma.tournament.findFirst({
    where: { id: tournamentId, ...publicWhere, status: 'registration', registrationOpen: true, subscribersNotifiedAt: null },
    select: { ...cardSelect, level: true },
  })
  if (!t) return 0
  // claimed once: two calls at the same moment do not both send
  const claimed = await prisma.tournament.updateMany({ where: { id: t.id, subscribersNotifiedAt: null }, data: { subscribersNotifiedAt: new Date() } })
  if (!claimed.count) return 0
  const subs = await prisma.botSubscriber.findMany({
    where: {
      AND: [
        { OR: [{ city: null }, { city: t.city }] },
        t.level === 'mixed' ? {} : { OR: [{ level: null }, { level: t.level }] },
      ],
    },
  })
  let sent = 0
  for (const sub of subs) {
    const l = asLang(sub.language), m = M[l]
    const linked = await prisma.user.findUnique({ where: { telegramChatId: sub.chatId }, select: { id: true } })
    const row: InlineButton[] = [{ text: m.details, callback_data: `tc:${t.id}` }]
    if (canApply(t as CardRow)) row.unshift({ text: linked ? m.apply : m.register, callback_data: linked ? `ta:${t.id}` : 'reg:start' })
    try {
      await sendMessage(sub.chatId, m.newTournament(cardText(t as CardRow, l)), { buttons: [row] })
      sent++
    } catch (e) {
      // the person blocked the bot: the subscription goes
      if (e instanceof TelegramError && (e.code === 403 || /chat not found/i.test(e.message))) await prisma.botSubscriber.delete({ where: { chatId: sub.chatId } }).catch(() => undefined)
    }
    if (env.NODE_ENV !== 'test') await pause(40)
  }
  return sent
}

// ---------- ⭐ ratings ----------

// after a round: the judges of this debate, five stars each (the speakers' feedback goes to the organizers only)
async function rateJudgesOf(chat: string, user: User, debateId: string) {
  const l = asLang(user.language), m = M[l]
  const d = await prisma.debate.findUnique({ where: { id: debateId }, select: { judges: { select: { judgeId: true, judge: { select: { name: true } } }, orderBy: { isChair: 'desc' } } } })
  if (!d?.judges.length) return sendMessage(chat, m.notFound)
  await sendMessage(chat, m.rateJudgesHead)
  for (const j of d.judges) {
    const stars = [1, 2, 3, 4, 5].map(n => ({ text: `${n}⭐`, callback_data: `fs:${debateId}:${j.judgeId}:${n}` }))
    await sendMessage(chat, m.rateJudge(j.judge.name), { buttons: [stars] })
  }
}

async function rateJudge(chat: string, user: User, debateId: string, judgeId: string, score: number) {
  const l = asLang(user.language), m = M[l]
  const r = await asUser(user, 'POST', `/debates/${debateId}/feedback`, { judgeId, score })
  if (!r.ok) return sendMessage(chat, explain(l, r.error, m.notFound))
  const judge = await prisma.judge.findUnique({ where: { id: judgeId }, select: { name: true } })
  return sendMessage(chat, m.rated(judge?.name ?? '', score))
}

async function rateTournament(chat: string, user: User, tournamentId: string, score: number) {
  const l = asLang(user.language), m = M[l]
  const r = await asUser(user, 'POST', `/tournaments/${tournamentId}/review`, { score })
  if (!r.ok) return sendMessage(chat, explain(l, r.error, m.notFound))
  const url = site(`/tournaments/${tournamentId}?tab=reviews`)
  return sendMessage(chat, linkable(url) ? m.ratedTournament(score) : `${m.ratedTournament(score)}\n${url}`, linkable(url) ? { buttons: [[{ text: m.onSite, url }]] } : {})
}

// ---------- taps ----------

export async function growthCallback(chat: string, data: string, user: User | null, tgLang?: string) {
  const l = user ? asLang(user.language) : fromTelegram(tgLang)
  if (data === 'sb:show') { await onSubscribe(chat, l); return true }
  if (data.startsWith('sb:')) { await subscribeCallback(chat, data, l); return true }
  if (!user) return false
  if (data.startsWith('fr:')) { await rateJudgesOf(chat, user, data.slice(3)); return true }
  if (data.startsWith('fs:')) {
    const [, debateId, judgeId, n] = data.split(':')
    await rateJudge(chat, user, debateId, judgeId, Number(n))
    return true
  }
  if (data.startsWith('rt:')) {
    const [, tid, n] = data.split(':')
    await rateTournament(chat, user, tid, Number(n))
    return true
  }
  return false
}

// ---------- 📤 sharing in any chat ----------

// "@bot" + words in any chat: the matching public tournaments (the nearest first when nothing is typed); the chosen
// one goes into the chat as its card, with a button that opens it in the bot (and on the site)
export async function onInlineQuery(q: TgInlineQuery) {
  const l = fromTelegram(q.from.language_code), m = M[l]
  const text = q.query.trim().slice(0, 64)
  const where = {
    ...publicWhere,
    ...(text ? { id: { in: await idsContaining('tournaments', text) } } : { status: { in: ['registration' as const, 'ongoing' as const] } }),
  }
  const list = await prisma.tournament.findMany({ where, select: cardSelect, orderBy: [{ status: 'asc' }, { startDate: 'asc' }], take: 10 })
  const bot = botUsername()
  const results = list.map(t => {
    const url = site(`/tournaments/${t.id}`)
    const buttons: InlineButton[][] = [[{ text: canApply(t) ? m.inlineApply : m.inlineOpen, url: `https://t.me/${bot}?start=t_${t.id}` }]]
    if (linkable(url)) buttons.push([{ text: m.onSite, url }])
    return {
      type: 'article', id: t.id, title: t.name,
      description: `${t.city} · ${t.startDate.toISOString().slice(0, 10).split('-').reverse().join('.')} · ${m.status[t.status] ?? ''}`,
      input_message_content: { message_text: cardText(t, l), parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
      reply_markup: { inline_keyboard: buttons },
    }
  })
  await answerInline(q.id, results)
}

