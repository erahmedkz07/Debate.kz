import type { User } from '../generated/prisma/client.js'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'
import { hashToken } from '../lib/tokens.js'
import { esc, sendMessage, type TgMessage, type TgUpdate } from '../lib/telegram.js'

// Telegram bot logic (transport-independent: fed by long polling, or by e2e in test mode).
// Private chats only. Linking: the site creates a one-time token -> t.me/<bot>?start=<token>.

const SHARE_PHONE = '📱 Поделиться номером'

const HELP = [
  '<b>Debate.kz</b> — уведомления о турнирах.',
  '',
  'Я пишу, когда выходит жеребьёвка (аудитория, сторона, тема), когда подтверждают заявку',
  'и когда администратор принимает решение по вашему турниру.',
  '',
  '/me — мой аккаунт',
  '/stop — выключить уведомления',
  '/on — включить уведомления',
].join('\n')

// KZ numbers only (+7 7xx): the platform is for Kazakhstan
export function normalizePhone(raw: string) {
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`
  if (d.length !== 11 || !d.startsWith('77')) return null
  return `+${d}`
}
const pretty = (p: string) => `${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5, 8)} ${p.slice(8, 10)} ${p.slice(10)}`

const linkedUser = (chatId: number) => prisma.user.findUnique({ where: { telegramChatId: String(chatId) } })

async function onStart(msg: TgMessage, token: string | undefined) {
  const chat = String(msg.chat.id)
  const current = await linkedUser(msg.chat.id)
  if (!token) {
    if (current) return sendMessage(chat, `Вы уже подключены как <b>${esc(current.name)}</b>.\n\n${HELP}`)
    return sendMessage(chat, `Чтобы получать уведомления, откройте профиль на сайте и нажмите «Подключить Telegram»:\n${env.CLIENT_ORIGIN}/me`)
  }
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } })
  if (!row || row.purpose !== 'telegram_link' || row.usedAt || row.expiresAt < new Date()) {
    return sendMessage(chat, 'Ссылка устарела или уже использована. Нажмите «Подключить Telegram» на сайте ещё раз.')
  }
  if (row.user.blocked) return sendMessage(chat, 'Аккаунт заблокирован.')
  // one Telegram account belongs to one site account
  if (current && current.id !== row.userId) {
    return sendMessage(chat, `Этот Telegram уже подключён к аккаунту <b>${esc(current.name)}</b>. Сначала отключите его там в профиле.`)
  }
  const user = await prisma.$transaction(async tx => {
    await tx.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } })
    return tx.user.update({ where: { id: row.userId }, data: { telegramChatId: chat, telegramUsername: msg.from?.username ?? null, telegramNotify: true } })
  })
  await sendMessage(chat, `✅ Готово, <b>${esc(user.name)}</b>! Telegram подключён к Debate.kz.\n\n${HELP}`)
  if (!user.phoneVerifiedAt) {
    await sendMessage(chat, 'Подтвердите номер телефона — это защищает турниры от фейковых аккаунтов. Нажмите кнопку ниже: Telegram передаст только ваш номер.', { requestContact: SHARE_PHONE })
  }
}

async function onContact(msg: TgMessage, user: User) {
  const chat = String(msg.chat.id)
  const c = msg.contact!
  // only your own contact counts (a forwarded contact card has someone else's user_id or none)
  if (!msg.from || c.user_id !== msg.from.id) return sendMessage(chat, 'Отправьте свой номер кнопкой ниже.', { requestContact: SHARE_PHONE })
  const phone = normalizePhone(c.phone_number)
  if (!phone) return sendMessage(chat, 'Поддерживаются номера Казахстана (+7 7xx).', { removeKeyboard: true })
  const other = await prisma.user.findUnique({ where: { verifiedPhone: phone } })
  if (other && other.id !== user.id) return sendMessage(chat, 'Этот номер уже подтверждён в другом аккаунте Debate.kz.', { removeKeyboard: true })
  await prisma.user.update({ where: { id: user.id }, data: { verifiedPhone: phone, phoneVerifiedAt: new Date(), phone: pretty(phone) } })
  return sendMessage(chat, `✅ Номер ${pretty(phone)} подтверждён.`, { removeKeyboard: true })
}

async function onMe(chat: string, user: User) {
  return sendMessage(chat, [
    `<b>${esc(user.name)}</b>`,
    `Телефон: ${user.phoneVerifiedAt ? '✅ подтверждён' : 'не подтверждён — отправьте /start и нажмите «Поделиться номером»'}`,
    `Уведомления: ${user.telegramNotify ? 'включены (/stop — выключить)' : 'выключены (/on — включить)'}`,
  ].join('\n'), user.phoneVerifiedAt ? {} : { requestContact: SHARE_PHONE })
}

export async function handleUpdate(update: TgUpdate) {
  const msg = update.message
  if (!msg || msg.chat.type !== 'private') return // groups are ignored
  const chat = String(msg.chat.id)
  const text = msg.text?.trim() ?? ''
  if (text.startsWith('/start')) return onStart(msg, text.split(/\s+/)[1])
  const user = await linkedUser(msg.chat.id)
  if (!user) return sendMessage(chat, `Этот чат ещё не подключён. Откройте профиль на сайте и нажмите «Подключить Telegram»:\n${env.CLIENT_ORIGIN}/me`)
  if (msg.contact) return onContact(msg, user)
  if (text === '/me') return onMe(chat, user)
  if (text === '/stop') {
    await prisma.user.update({ where: { id: user.id }, data: { telegramNotify: false } })
    return sendMessage(chat, 'Уведомления выключены. /on — включить снова.')
  }
  if (text === '/on') {
    await prisma.user.update({ where: { id: user.id }, data: { telegramNotify: true } })
    return sendMessage(chat, 'Уведомления включены.')
  }
  return sendMessage(chat, HELP)
}

export const BOT_COMMANDS = [
  { command: 'me', description: 'Мой аккаунт' },
  { command: 'stop', description: 'Выключить уведомления' },
  { command: 'on', description: 'Включить уведомления' },
  { command: 'help', description: 'Что умеет бот' },
]
