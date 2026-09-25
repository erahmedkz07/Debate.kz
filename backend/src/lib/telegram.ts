import { env } from './env.js'

// Minimal Telegram Bot API client (plain fetch, no SDK).
// The bot is optional: without TELEGRAM_BOT_TOKEN every call is a no-op and the site works as before.
// With NODE_ENV=test nothing is sent to Telegram: messages go to an in-memory outbox that e2e reads.

const isTest = env.NODE_ENV === 'test'
export const telegramEnabled = () => isTest || !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME)
export const botUsername = () => (isTest ? 'DebateKzTestBot' : env.TELEGRAM_BOT_USERNAME)

export interface InlineButton { text: string; callback_data?: string; url?: string }
export interface SendOptions {
  buttons?: InlineButton[][] // inline keyboard under the message
  requestContact?: string // one-button reply keyboard "share my phone number"
  removeKeyboard?: boolean
}

export interface OutboxItem { method: string; chat_id?: string; text?: string; reply_markup?: unknown }
export const outbox: OutboxItem[] = []

export class TelegramError extends Error {
  constructor(public method: string, public code: number, description: string) {
    super(`telegram ${method} ${code}: ${description}`)
  }
}

async function call<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T | null> {
  if (isTest) {
    outbox.push({ method, ...payload } as OutboxItem)
    return { message_id: outbox.length } as T
  }
  if (!env.TELEGRAM_BOT_TOKEN) return null
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(method === 'getUpdates' ? 40_000 : 10_000),
  })
  const data = await res.json() as { ok: boolean; result?: T; error_code?: number; description?: string }
  if (!data.ok) throw new TelegramError(method, data.error_code ?? res.status, data.description ?? 'unknown')
  return data.result ?? null
}

// user-provided text must be escaped for parse_mode=HTML
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function sendMessage(chatId: string, text: string, opts: SendOptions = {}) {
  const reply_markup = opts.buttons ? { inline_keyboard: opts.buttons }
    : opts.requestContact ? { keyboard: [[{ text: opts.requestContact, request_contact: true }]], resize_keyboard: true, one_time_keyboard: true }
      : opts.removeKeyboard ? { remove_keyboard: true } : undefined
  return call<{ message_id: number }>('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup })
}

export const getUpdates = (offset: number) =>
  call<TgUpdate[]>('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] })
export const setCommands = (commands: { command: string; description: string }[]) => call('setMyCommands', { commands })

// Telegram accepts only public https links in buttons; on localhost the link goes into the text instead
export const linkable = (url: string) => url.startsWith('https://')

// ---------- the parts of Telegram updates the bot uses ----------
export interface TgUser { id: number; username?: string; first_name?: string }
export interface TgMessage {
  message_id: number
  from?: TgUser
  chat: { id: number; type: string }
  text?: string
  contact?: { phone_number: string; user_id?: number }
}
export interface TgUpdate {
  update_id: number
  message?: TgMessage
}
