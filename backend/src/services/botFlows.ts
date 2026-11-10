import { z } from 'zod'
import type { Prisma, User } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { hashToken } from '../lib/tokens.js'
import { kzPhone } from '../lib/phone.js'
import { todayKz, toDay } from '../lib/dates.js'
import { personName } from '../lib/names.js'
import { editMessage, linkable, sendMessage, type InlineButton, type TgMessage } from '../lib/telegram.js'
import { asLang, fromTelegram, type Lang } from './botTexts.js'
import { F } from './botFlowTexts.js'
import { asUser, explain } from './botApi.js'
import { rulesOf } from './formats.js'
import { publicWhere } from './tournaments.js'
import { sendVerification } from '../routes/auth.js'

// The bot's step-by-step dialogs: sign-up, confirming a sign-in on the site, the club, an application, check-in.
// Where a person is in a dialog is kept in the database (bot_dialogs), so a restart of the server loses nothing.
// Everything that changes data for a signed-up person goes through the site's API (botApi.asUser): the same rules.

const DIALOG_TTL_MS = 60 * 60 * 1000
const site = (path: string) => `${env.CLIENT_ORIGIN}${path}`
type Data = Record<string, unknown>

export async function dialogOf(chat: string) {
  const d = await prisma.botDialog.findUnique({ where: { chatId: chat } })
  if (!d) return null
  if (Date.now() - d.updatedAt.getTime() > DIALOG_TTL_MS) { await endDialog(chat); return null }
  return { step: d.step, data: (d.data ?? {}) as Data }
}
const setDialog = (chat: string, step: string, data: Data = {}) =>
  prisma.botDialog.upsert({ where: { chatId: chat }, create: { chatId: chat, step, data: data as Prisma.InputJsonValue }, update: { step, data: data as Prisma.InputJsonValue } })
export const endDialog = (chat: string) => prisma.botDialog.deleteMany({ where: { chatId: chat } })

const cancelRow = (l: Lang): InlineButton[] => [{ text: F[l].cancel, callback_data: 'flow:cancel' }]
const say = (chat: string, text: string, buttons?: InlineButton[][]) => sendMessage(chat, text, buttons ? { buttons } : {})

// ---------- the first message, sign-up ----------

export async function greet(msg: TgMessage) {
  const chat = String(msg.chat.id), l = fromTelegram(msg.from?.language_code)
  return say(chat, F[l].welcome, [[{ text: F[l].register, callback_data: 'reg:start' }], [{ text: F[l].haveAccount, callback_data: 'reg:have' }]])
}

export async function startRegistration(chat: string, l: Lang, extra: Data = {}) {
  const privacy = site('/privacy'), terms = site('/terms')
  await setDialog(chat, 'reg.consent', { lang: l, ...extra })
  const text = linkable(privacy) ? F[l].consent(privacy, terms) : F[l].consentPlain(privacy, terms)
  return say(chat, text, [[{ text: F[l].agree, callback_data: 'reg:agree' }], cancelRow(l)])
}

const emailSchema = z.string().trim().toLowerCase().email().max(200)
const fullName = personName().refine(v => v.includes(' '))

async function registrationStep(msg: TgMessage, step: string, data: Data) {
  const chat = String(msg.chat.id), l = asLang(data.lang), t = F[l]
  const text = msg.text?.trim() ?? ''
  if (step === 'reg.name') {
    const name = fullName.safeParse(text)
    if (!name.success) return say(chat, t.badName)
    await setDialog(chat, 'reg.phone', { ...data, name: name.data })
    return sendMessage(chat, t.askPhone, { requestContact: t.sharePhone })
  }
  if (step === 'reg.phone') {
    const c = msg.contact
    if (!c) return sendMessage(chat, t.askPhone, { requestContact: t.sharePhone })
    // only your own contact counts (a forwarded contact card has someone else's user_id or none)
    if (!msg.from || c.user_id !== msg.from.id) return sendMessage(chat, t.ownContact, { requestContact: t.sharePhone })
    const pretty = kzPhone(c.phone_number.startsWith('+') ? c.phone_number : `+${c.phone_number}`)
    if (!pretty) return sendMessage(chat, t.kzOnly, { removeKeyboard: true })
    const verified = `+${pretty.replace(/\D/g, '')}`
    if (await prisma.user.findUnique({ where: { verifiedPhone: verified } })) {
      await endDialog(chat)
      return sendMessage(chat, t.phoneTaken(site('/login')), { removeKeyboard: true })
    }
    await setDialog(chat, 'reg.email', { ...data, phone: pretty, verifiedPhone: verified })
    return sendMessage(chat, t.askEmail, { removeKeyboard: true })
  }
  if (step === 'reg.email') {
    const email = emailSchema.safeParse(text)
    if (!email.success) return say(chat, t.badEmail)
    if (await prisma.user.findUnique({ where: { email: email.data } })) { await endDialog(chat); return say(chat, t.emailTaken(site('/login'))) }
    if (await prisma.user.findUnique({ where: { telegramChatId: chat } })) { await endDialog(chat); return say(chat, t.failed) }
    let user: User
    try {
      user = await prisma.user.create({
        data: {
          email: email.data, name: String(data.name), phone: String(data.phone), verifiedPhone: String(data.verifiedPhone), phoneVerifiedAt: new Date(),
          telegramChatId: chat, telegramUsername: msg.from?.username ?? null, telegramNotify: true, language: l, consentAt: new Date(),
        },
      })
    } catch {
      // the same email or phone taken a moment ago by someone else
      await endDialog(chat)
      return say(chat, t.emailTaken(site('/login')))
    }
    await endDialog(chat)
    await sendVerification(user).catch(() => undefined)
    await say(chat, t.registered(user.name))
    // the sign-up started from "Sign in with Telegram" on the site: now confirm that sign-in
    if (typeof data.login === 'string') await askLogin(chat, user, data.login)
    return
  }
}

// ---------- signing in on the site ----------

const deviceOf = (ua: string | null) => {
  if (!ua) return ''
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /YaBrowser/.test(ua) ? 'Yandex' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return [browser, os].filter(Boolean).join(', ')
}
const openLogin = (id: string) => prisma.telegramLogin.findFirst({ where: { id, usedAt: null, approvedAt: null, deniedAt: null, expiresAt: { gt: new Date() } } })

async function askLogin(chat: string, user: User, loginId: string) {
  const l = asLang(user.language), row = await openLogin(loginId)
  if (!row) return say(chat, F[l].loginExpired)
  return say(chat, F[l].loginAsk(user.name, deviceOf(row.userAgent)), [[{ text: F[l].loginYes, callback_data: `login:ok:${row.id}` }, { text: F[l].loginNo, callback_data: `login:no:${row.id}` }]])
}

// /start login_<token>
export async function onLoginLink(msg: TgMessage, token: string, user: User | null) {
  const chat = String(msg.chat.id)
  const row = await prisma.telegramLogin.findUnique({ where: { tokenHash: hashToken(token) } })
  const l = user ? asLang(user.language) : fromTelegram(msg.from?.language_code)
  if (!row || row.usedAt || row.approvedAt || row.deniedAt || row.expiresAt < new Date()) return say(chat, F[l].loginExpired)
  if (user) return askLogin(chat, user, row.id)
  await say(chat, F[l].loginNeedAccount)
  return startRegistration(chat, l, { login: row.id })
}

async function decideLogin(chat: string, user: User, id: string, ok: boolean, messageId?: number) {
  const l = asLang(user.language)
  const done = await prisma.telegramLogin.updateMany({
    where: { id, usedAt: null, approvedAt: null, deniedAt: null, expiresAt: { gt: new Date() } },
    data: ok ? { approvedAt: new Date(), userId: user.id } : { deniedAt: new Date() },
  })
  const text = !done.count ? F[l].loginExpired : ok ? F[l].loginDone : F[l].loginDenied
  if (messageId) return editMessage(chat, messageId, text).catch(() => say(chat, text))
  return say(chat, text)
}

// ---------- the club ----------

async function membershipOf(userId: string) {
  return prisma.clubMember.findUnique({ where: { userId }, include: { club: { include: { teams: { orderBy: { name: 'asc' } } } }, team: true } })
}

export async function onClub(chat: string, user: User) {
  const t = F[asLang(user.language)], m = await membershipOf(user.id)
  if (!m) {
    await setDialog(chat, 'club.code', { lang: user.language })
    return say(chat, t.clubNone(site('/clubs')), [cancelRow(asLang(user.language))])
  }
  await say(chat, t.clubIs(m.club.name, m.team?.name ?? null, m.club.status !== 'approved'))
  return say(chat, t.pickTeam, [
    ...m.club.teams.slice(0, 20).map(x => [{ text: `${x.id === m.teamId ? '✓ ' : ''}${x.name}`, callback_data: `club:team:${x.id}` }]),
    [{ text: t.newTeam, callback_data: 'club:new' }],
  ])
}

async function clubStep(msg: TgMessage, user: User, step: string) {
  const chat = String(msg.chat.id), l = asLang(user.language), t = F[l]
  const text = (msg.text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (step === 'club.code') {
    if (text.length !== 8) return say(chat, t.badCode, [cancelRow(l)])
    const r = await asUser<{ id: string }>(user, 'POST', '/clubs/join', { code: text })
    if (!r.ok) return say(chat, explain(l, r.error, t.failed), [cancelRow(l)])
    await endDialog(chat)
    const m = await membershipOf(user.id)
    await say(chat, t.clubJoined(m?.club.name ?? ''))
    return onClub(chat, user)
  }
  if (step === 'club.newteam') {
    const m = await membershipOf(user.id)
    if (!m) { await endDialog(chat); return onClub(chat, user) }
    const r = await asUser<{ name: string }>(user, 'POST', `/clubs/${m.clubId}/teams`, { name: (msg.text ?? '').trim(), join: true })
    if (!r.ok) return say(chat, explain(l, r.error, t.failed), [cancelRow(l)])
    await endDialog(chat)
    return say(chat, t.teamSet(r.data?.name ?? ''))
  }
}

// ---------- an application ----------

async function openTournaments(userId: string) {
  return prisma.tournament.findMany({
    where: {
      ...publicWhere, status: 'registration', registrationOpen: true, kind: { not: 'local' },
      registrations: { none: { userId, status: { not: 'rejected' } } },
    },
    orderBy: { startDate: 'asc' }, take: 20,
    select: { id: true, name: true, city: true, startDate: true, registrationDeadline: true },
  }).then(list => list.filter(x => !x.registrationDeadline || toDay(x.registrationDeadline) >= todayKz()).slice(0, 8))
}

export async function onApply(chat: string, user: User) {
  const l = asLang(user.language), t = F[l]
  const m = await membershipOf(user.id)
  if (!m) return say(chat, t.noClub)
  if (m.club.status !== 'approved') return say(chat, t.clubPending)
  if (!m.team) return say(chat, t.noTeam)
  const list = await openTournaments(user.id)
  if (!list.length) return say(chat, t.noOpen(site('/tournaments')))
  return say(chat, t.pickTournament, list.map(x => [{ text: `${x.name} · ${x.city}, ${toDay(x.startDate).split('-').reverse().slice(0, 2).join('.')}`, callback_data: `apply:t:${x.id}` }]))
}

async function applyPick(chat: string, user: User, tournamentId: string) {
  const l = asLang(user.language), t = F[l]
  const [m, tour] = await Promise.all([membershipOf(user.id), prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, name: true, format: true, level: true } })])
  if (!m?.team || !tour) return say(chat, t.failed)
  const need = rulesOf(tour.format).speakers
  // the team's members from the club, the applicant first
  const members = await prisma.clubMember.findMany({ where: { teamId: m.teamId }, include: { user: { select: { id: true, name: true } } } })
  const names = [user.name, ...members.filter(x => x.userId !== user.id).map(x => x.user.name)]
  const data: Data = { lang: l, tid: tour.id, tname: tour.name, team: m.team.name, need, minors: tour.level !== 'university' }
  if (names.length >= need) {
    const speakers = names.slice(0, need)
    await setDialog(chat, 'apply.check', { ...data, speakers })
    return say(chat, t.speakersAre(m.team.name, speakers), [[{ text: t.yes, callback_data: 'apply:ok' }, { text: t.edit, callback_data: 'apply:edit' }], cancelRow(l)])
  }
  await setDialog(chat, 'apply.speakers', data)
  return say(chat, t.askSpeakers(need), [cancelRow(l)])
}

// after the speakers: the school, the parents' consent, then the summary to send
async function applyNext(chat: string, user: User, data: Data) {
  const l = asLang(user.language), t = F[l]
  const institution = (data.institution as string | undefined) ?? user.institution ?? ''
  if (institution.trim().length < 2) {
    await setDialog(chat, 'apply.inst', data)
    return say(chat, t.askInstitution, [cancelRow(l)])
  }
  if (data.minors && !data.guardian) {
    await setDialog(chat, 'apply.guardian', { ...data, institution })
    return say(chat, t.guardian, [[{ text: t.guardianYes, callback_data: 'apply:guardian' }], cancelRow(l)])
  }
  const phone = user.phone || (user.verifiedPhone ? kzPhone(user.verifiedPhone) : null)
  if (!phone) {
    await endDialog(chat)
    return sendMessage(chat, t.needPhone, { requestContact: t.sharePhone })
  }
  const full = { ...data, institution, phone }
  await setDialog(chat, 'apply.confirm', full)
  return say(chat, t.summary({ tournament: String(data.tname), team: String(data.team), speakers: data.speakers as string[], institution, phone }), [[{ text: t.send, callback_data: 'apply:send' }], cancelRow(l)])
}

async function applyStep(msg: TgMessage, user: User, step: string, data: Data) {
  const chat = String(msg.chat.id), l = asLang(user.language), t = F[l]
  const text = msg.text?.trim() ?? ''
  if (step === 'apply.speakers') {
    const need = Number(data.need)
    const lines = text.split('\n').map(x => x.trim()).filter(Boolean)
    const parsed = lines.map(x => personName().safeParse(x))
    if (lines.length !== need || parsed.some(p => !p.success)) return say(chat, t.badSpeakers(need), [cancelRow(l)])
    return applyNext(chat, user, { ...data, speakers: parsed.map(p => p.data!) })
  }
  if (step === 'apply.inst') {
    if (text.length < 2 || text.length > 150) return say(chat, t.askInstitution, [cancelRow(l)])
    return applyNext(chat, user, { ...data, institution: text })
  }
  return say(chat, t.expired)
}

async function applySend(chat: string, user: User, data: Data) {
  const l = asLang(user.language), t = F[l]
  const r = await asUser<{ status: string }>(user, 'POST', `/tournaments/${data.tid}/registrations`, {
    teamName: data.team, institution: data.institution, speakers: data.speakers, phone: data.phone, guardianConsent: data.minors ? true : undefined,
  })
  await endDialog(chat)
  if (!r.ok) return say(chat, explain(l, r.error, t.failed))
  const done = t.applied[r.data?.status ?? 'pending'] ?? t.applied.pending
  const url = site(`/tournaments/${data.tid}`)
  return sendMessage(chat, done(String(data.tname)), linkable(url) ? { buttons: [[{ text: '🔗 Debaters.kz', url }]] } : {})
}

// ---------- check-in ----------

async function checkinTournaments(userId: string) {
  return prisma.tournament.findMany({
    where: { status: { not: 'finished' }, startDate: { lte: new Date(Date.now() + 864e5) }, teams: { some: { withdrawnAt: null, speakers: { some: { userId } } } } },
    select: { id: true, name: true }, take: 5,
  })
}

export async function onCheckin(chat: string, user: User) {
  const l = asLang(user.language), t = F[l]
  const list = await checkinTournaments(user.id)
  if (!list.length) return say(chat, t.noCheckin)
  if (list.length === 1) return checkinPick(chat, user, list[0].id)
  return say(chat, t.pickCheckin, list.map(x => [{ text: x.name, callback_data: `checkin:t:${x.id}` }]))
}

async function checkinPick(chat: string, user: User, tid: string) {
  const l = asLang(user.language)
  await setDialog(chat, 'checkin.code', { lang: l, tid })
  return say(chat, F[l].askCode, [cancelRow(l)])
}

async function checkinStep(msg: TgMessage, user: User, data: Data) {
  const chat = String(msg.chat.id), l = asLang(user.language), t = F[l]
  const r = await asUser<{ team: string }>(user, 'POST', `/checkin/${data.tid}`, { code: msg.text ?? '' })
  if (!r.ok) return say(chat, explain(l, r.error, t.failed), r.error === 'wrong_checkin_code' ? [cancelRow(l)] : undefined)
  await endDialog(chat)
  return say(chat, t.checkedIn(r.data?.team ?? ''))
}

// ---------- routing ----------

// a message while a dialog is open: true when the dialog took it
export async function continueDialog(msg: TgMessage, user: User | null) {
  const chat = String(msg.chat.id)
  const d = await dialogOf(chat)
  if (!d) return false
  if (d.step.startsWith('reg.')) {
    if (user) { await endDialog(chat); return false }
    if (d.step === 'reg.consent') { await say(chat, F[asLang(d.data.lang)].consentPlain(site('/privacy'), site('/terms')), [[{ text: F[asLang(d.data.lang)].agree, callback_data: 'reg:agree' }]]); return true }
    await registrationStep(msg, d.step, d.data)
    return true
  }
  if (!user) { await endDialog(chat); return false }
  if (d.step.startsWith('club.')) await clubStep(msg, user, d.step)
  else if (d.step.startsWith('apply.')) await applyStep(msg, user, d.step, d.data)
  else if (d.step === 'checkin.code') await checkinStep(msg, user, d.data)
  else { await endDialog(chat); return false }
  return true
}

// taps on the dialogs' buttons: true when handled here
export async function flowCallback(chat: string, data: string, user: User | null, tgLang: string | undefined, messageId?: number) {
  const l = user ? asLang(user.language) : fromTelegram(tgLang), t = F[l]
  if (data === 'flow:cancel') { await endDialog(chat); await say(chat, t.cancelled); return true }
  if (data === 'reg:have') { await say(chat, t.haveAccountText(site('/me'))); return true }
  if (data === 'reg:start') {
    if (user) { await say(chat, t.alreadyRegistered(user.name)); return true }
    await startRegistration(chat, l)
    return true
  }
  if (data === 'reg:agree') {
    const d = await dialogOf(chat)
    if (user || d?.step !== 'reg.consent') { await say(chat, t.expired); return true }
    await setDialog(chat, 'reg.name', d.data)
    await say(chat, F[asLang(d.data.lang)].askName, [cancelRow(asLang(d.data.lang))])
    return true
  }
  if (data.startsWith('login:')) {
    const [, verdict, id] = data.split(':')
    if (!user) { await say(chat, t.loginExpired); return true }
    await decideLogin(chat, user, id, verdict === 'ok', messageId)
    return true
  }
  if (!user) return false
  if (data.startsWith('club:team:')) {
    const m = await membershipOf(user.id)
    if (!m) { await onClub(chat, user); return true }
    const r = await asUser(user, 'PUT', `/clubs/${m.clubId}/members/${user.id}/team`, { teamId: data.slice('club:team:'.length) })
    const team = m.club.teams.find(x => x.id === data.slice('club:team:'.length))
    await say(chat, r.ok ? t.teamSet(team?.name ?? '') : explain(l, r.error, t.failed))
    return true
  }
  if (data === 'club:new') { await setDialog(chat, 'club.newteam', { lang: l }); await say(chat, t.askTeamName, [cancelRow(l)]); return true }
  if (data.startsWith('apply:t:')) { await applyPick(chat, user, data.slice('apply:t:'.length)); return true }
  if (data.startsWith('checkin:t:')) { await checkinPick(chat, user, data.slice('checkin:t:'.length)); return true }
  if (data.startsWith('apply:')) {
    const d = await dialogOf(chat)
    if (!d?.step.startsWith('apply.')) { await say(chat, t.expired); return true }
    if (data === 'apply:ok' && d.step === 'apply.check') await applyNext(chat, user, d.data)
    else if (data === 'apply:edit' && d.step === 'apply.check') { await setDialog(chat, 'apply.speakers', d.data); await say(chat, t.askSpeakers(Number(d.data.need)), [cancelRow(l)]) }
    else if (data === 'apply:guardian' && d.step === 'apply.guardian') await applyNext(chat, user, { ...d.data, guardian: true })
    else if (data === 'apply:send' && d.step === 'apply.confirm') await applySend(chat, user, d.data)
    else await say(chat, t.expired)
    return true
  }
  return false
}
