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

export const paymentConfirmedLetter = (u: User, tournament: string, reference: string) => sendMail({
  to: u.email,
  subject: 'Debate.kz — оплата Pro подтверждена',
  text: `Здравствуйте, ${u.name}!\n\nОплата тарифа Pro для турнира «${tournament}» подтверждена (код платежа ${reference}). Ограничение по числу команд снято — все функции панели доступны.\n\nСпасибо, что проводите турниры на Debate.kz!`,
  action: { label: 'Открыть мои турниры', url: site('/dashboard') },
})

export const paymentRejectedLetter = (u: User, tournament: string, reason: string, tournamentId: string) => sendMail({
  to: u.email,
  subject: 'Debate.kz — оплата Pro не подтверждена',
  text: `Здравствуйте, ${u.name}!\n\nМы не нашли оплату тарифа Pro для турнира «${tournament}».\n\nПричина: ${reason}\n\nПроверьте перевод в Kaspi и нажмите «Я оплатил» ещё раз, указав имя плательщика и время перевода. Если что-то непонятно — напишите на hello@debate.kz.`,
  action: { label: 'Открыть оплату турнира', url: site(`/dashboard/tournaments/${tournamentId}/settings`) },
})

// an invite by email: to a registered person or to someone who still has to sign up
export const inviteLetter = (to: string, d: { inviter: string; tournament: string; kind: 'judge' | 'co_organizer'; registered: boolean; url: string }) => sendMail({
  to,
  subject: d.kind === 'judge' ? `Debate.kz — приглашение судить «${d.tournament}»` : `Debate.kz — приглашение в организаторы «${d.tournament}»`,
  text: `Здравствуйте!\n\n${d.inviter} приглашает вас ${d.kind === 'judge' ? 'судить турнир' : 'стать соорганизатором турнира'} «${d.tournament}» на Debate.kz.\n\n${d.kind === 'judge'
    ? 'Если вы примете приглашение, вам откроется раздел «Судейство»: назначения на дебаты и онлайн-бюллетени этого турнира. Судить турнир, в котором вы участвуете как спикер, нельзя.'
    : 'Если вы примете приглашение, вы сможете управлять турниром вместе с организатором.'}\n\n${d.registered
    ? 'Войдите в аккаунт с этим email и примите или отклоните приглашение.'
    : 'У вас ещё нет аккаунта: зарегистрируйтесь на Debate.kz с этим email (можно через Google) — после этого приглашение можно принять.'} Ссылка действует 7 дней.\n\nЕсли вы не ждали этого письма, просто проигнорируйте его.`,
  action: { label: 'Открыть приглашение', url: d.url },
})
