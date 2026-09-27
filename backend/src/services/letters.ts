import type { User } from '../generated/prisma/client.js'
import { env } from '../lib/env.js'
import { sendMail } from '../lib/mail.js'

// Every letter the platform sends, in one place. Security letters (password changed, Google linked/unlinked)
// go to the account's email so the owner learns about a change they did not make.

const site = (path: string) => `${env.CLIENT_ORIGIN}${path}`
const when = () => new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', dateStyle: 'long', timeStyle: 'short' })
const notYou = 'Если это были не вы, сразу восстановите пароль по ссылке «Забыли пароль?» на странице входа и напишите нам на hello@debate.kz.'

export const verifyEmailLetter = (u: User, token: string) => sendMail({
  to: u.email,
  subject: 'Debate.kz — подтвердите email',
  text: `Здравствуйте, ${u.name}!\n\nПодтвердите адрес, чтобы создавать турниры и регистрировать команды. Ссылка действует 24 часа.\n\nЕсли вы не регистрировались на Debate.kz, просто проигнорируйте письмо.`,
  action: { label: 'Подтвердить email', url: site(`/verify-email?token=${token}`) },
})

export const resetPasswordLetter = (u: User, token: string) => sendMail({
  to: u.email,
  subject: u.passwordHash ? 'Debate.kz — восстановление пароля' : 'Debate.kz — задайте пароль',
  text: u.passwordHash
    ? `Здравствуйте, ${u.name}!\n\nЧтобы задать новый пароль, нажмите кнопку ниже. Ссылка действует 1 час и работает один раз.\n\nЕсли вы не запрашивали восстановление, просто проигнорируйте письмо — ваш пароль не изменится.`
    : `Здравствуйте, ${u.name}!\n\nВы входите на Debate.kz через Google. Чтобы входить ещё и по email с паролем, задайте пароль по кнопке ниже. Ссылка действует 1 час и работает один раз.\n\nЕсли вы этого не запрашивали, просто проигнорируйте письмо.`,
  action: { label: u.passwordHash ? 'Задать новый пароль' : 'Задать пароль', url: site(`/reset-password?token=${token}`) },
})

export const passwordChangedLetter = (u: User, firstTime: boolean) => sendMail({
  to: u.email,
  subject: firstTime ? 'Debate.kz — пароль задан' : 'Debate.kz — пароль изменён',
  text: `Здравствуйте, ${u.name}!\n\n${firstTime ? 'Для вашего аккаунта задан пароль' : 'Пароль от вашего аккаунта изменён'} ${when()} (время Астаны). Все остальные устройства вышли из аккаунта.\n\n${notYou}`,
})

export const welcomeGoogleLetter = (u: User) => sendMail({
  to: u.email,
  subject: 'Добро пожаловать на Debate.kz',
  text: `Здравствуйте, ${u.name}!\n\nВы создали аккаунт на Debate.kz через Google — email уже подтверждён.\n\nДобавьте в профиле телефон, учебное заведение и город: они нужны для заявок на турниры. Пароль не обязателен — входите кнопкой «Войти через Google». Если захотите входить и по паролю, задайте его в профиле.`,
  action: { label: 'Открыть профиль', url: site('/me') },
})

export const googleLinkedLetter = (u: User, googleEmail: string, passwordRemoved: boolean) => sendMail({
  to: u.email,
  subject: 'Debate.kz — вход через Google подключён',
  text: `Здравствуйте, ${u.name}!\n\nК вашему аккаунту ${when()} (время Астаны) подключён вход через Google (${googleEmail}).${passwordRemoved ? '\n\nEmail этого аккаунта раньше не был подтверждён, поэтому прежний пароль сброшен, а все устройства вышли из аккаунта: так никто, кто мог знать этот пароль, не войдёт вместо вас. Входите через Google или задайте новый пароль в профиле.' : ''}\n\n${notYou}`,
})

export const googleUnlinkedLetter = (u: User, googleEmail: string) => sendMail({
  to: u.email,
  subject: 'Debate.kz — вход через Google отключён',
  text: `Здравствуйте, ${u.name}!\n\nВход через Google (${googleEmail}) отключён от вашего аккаунта ${when()} (время Астаны). Входите по email и паролю.\n\n${notYou}`,
})
