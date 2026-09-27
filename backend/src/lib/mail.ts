import nodemailer, { type Transporter } from 'nodemailer'
import { env } from './env.js'

// Mail transport. With SMTP_* set (e.g. Gmail with an app password) letters really go out;
// without it every letter is printed to the server console, and in test mode it is also kept in `mailOutbox`.
// Every letter has a plain-text part and a simple HTML part with one action button.
export interface Mail {
  to: string
  subject: string
  text: string // paragraphs separated by blank lines
  action?: { label: string; url: string } // main button; the link is also written into the text part
}

export const mailOutbox: Mail[] = [] // test mode only

let transport: Transporter | null = null
const smtp = () => {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // 465 = TLS from the start, 587 = STARTTLS
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  })
  return transport
}
export const mailEnabled = () => !!smtp()

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function html(mail: Mail) {
  const paragraphs = mail.text.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px;line-height:1.55">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
  const button = mail.action
    ? `<p style="margin:22px 0"><a href="${esc(mail.action.url)}" style="display:inline-block;background:#009bc9;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">${esc(mail.action.label)}</a></p>
       <p style="margin:0 0 14px;font-size:12px;color:#5b6b75;word-break:break-all">Если кнопка не открывается, скопируйте ссылку: ${esc(mail.action.url)}</p>`
    : ''
  return `<!doctype html><html lang="ru"><body style="margin:0;background:#f7fbfd;font-family:Arial,Helvetica,sans-serif;color:#0b2230">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7fbfd;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3eef3">
<tr><td style="background:#009bc9;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:800">Debate.kz</td></tr>
<tr><td style="padding:24px;font-size:15px">${paragraphs}${button}</td></tr>
<tr><td style="padding:14px 24px;background:#f7fbfd;font-size:12px;color:#5b6b75">Письмо отправлено автоматически, отвечать на него не нужно. © Debate.kz</td></tr>
</table></td></tr></table></body></html>`
}

// Never throws: a mail server hiccup must not break the request that sent the letter
// (e.g. the account is already created). Returns false when the letter did not go out.
export async function sendMail(mail: Mail): Promise<boolean> {
  const text = mail.action ? `${mail.text}\n\n${mail.action.label}: ${mail.action.url}` : mail.text
  if (env.NODE_ENV === 'test') mailOutbox.push(mail)
  const t = smtp()
  if (!t) {
    const line = '─'.repeat(64)
    console.log(`\n${line}\n📧  EMAIL (console transport)\nTo:      ${mail.to}\nSubject: ${mail.subject}\n\n${text}\n${line}\n`)
    return true
  }
  try {
    await t.sendMail({ from: env.MAIL_FROM ?? `Debate.kz <${env.SMTP_USER}>`, to: mail.to, subject: mail.subject, text, html: html(mail) })
    return true
  } catch (e) {
    console.error('[mail]', mail.subject, '→', mail.to, e instanceof Error ? e.message : e)
    return false
  }
}
