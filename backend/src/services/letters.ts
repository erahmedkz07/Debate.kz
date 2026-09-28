import type { User } from '../generated/prisma/client.js'
import { env } from '../lib/env.js'
import { sendMail, type MailLang } from '../lib/mail.js'

// Every letter the platform sends, in one place, in Kazakh and Russian. A person gets letters in the language of
// their account (the site's switch); when the language is unknown (an invite to an email without an account) the
// letter carries both, Kazakh first. Security letters (password changed, Google linked/unlinked) go to the account's
// email so the owner learns about a change they did not make.

type Lang = 'ru' | 'kz'
interface Letter { subject: string; text: string; action?: { label: string; url: string } }
const site = (path: string) => `${env.CLIENT_ORIGIN}${path}`
const langOf = (u: User): Lang => (u.language === 'kz' ? 'kz' : 'ru')
const when = (l: Lang) => new Date().toLocaleString(l === 'kz' ? 'kk-KZ' : 'ru-RU', { timeZone: 'Asia/Almaty', dateStyle: 'long', timeStyle: 'short' })
const notYou: Record<Lang, string> = {
  ru: 'Если это были не вы, сразу восстановите пароль по ссылке «Забыли пароль?» на странице входа и напишите нам на hello@debate.kz.',
  kz: 'Егер бұл сіз болмасаңыз, кіру бетіндегі «Құпиясөзді ұмыттыңыз ба?» сілтемесі арқылы құпиясөзді бірден қалпына келтіріп, hello@debate.kz мекенжайына жазыңыз.',
}

// one letter in the person's language, or both languages in one letter
function send(to: string, lang: Lang | 'both', build: (l: Lang) => Letter) {
  if (lang !== 'both') return sendMail({ to, lang, ...build(lang) })
  const kz = build('kz')
  const ru = build('ru')
  return sendMail({
    to,
    lang: 'both' satisfies MailLang,
    subject: `${kz.subject} / ${ru.subject.replace(/^Debate\.kz — /, '')}`,
    text: `${kz.text}\n\n— — —\n\n${ru.text}`,
    action: kz.action && ru.action && { label: `${kz.action.label} / ${ru.action.label}`, url: kz.action.url },
  })
}

export const verifyEmailLetter = (u: User, token: string) => send(u.email, langOf(u), l => ({
  ru: {
    subject: 'Debate.kz — подтвердите email',
    text: `Здравствуйте, ${u.name}!\n\nПодтвердите адрес, чтобы создавать турниры и регистрировать команды. Ссылка действует 24 часа.\n\nЕсли вы не регистрировались на Debate.kz, просто проигнорируйте письмо.`,
    action: { label: 'Подтвердить email', url: site(`/verify-email?token=${token}`) },
  },
  kz: {
    subject: 'Debate.kz — email-ді растаңыз',
    text: `Сәлеметсіз бе, ${u.name}!\n\nТурнир құру және команда тіркеу үшін мекенжайыңызды растаңыз. Сілтеме 24 сағат жарамды.\n\nЕгер Debate.kz-те тіркелмеген болсаңыз, хатты елемей-ақ қойыңыз.`,
    action: { label: 'Email-ді растау', url: site(`/verify-email?token=${token}`) },
  },
}[l]))

export const resetPasswordLetter = (u: User, token: string) => send(u.email, langOf(u), l => {
  const url = site(`/reset-password?token=${token}`)
  if (u.passwordHash) return {
    ru: {
      subject: 'Debate.kz — восстановление пароля',
      text: `Здравствуйте, ${u.name}!\n\nЧтобы задать новый пароль, нажмите кнопку ниже. Ссылка действует 1 час и работает один раз.\n\nЕсли вы не запрашивали восстановление, просто проигнорируйте письмо — ваш пароль не изменится.`,
      action: { label: 'Задать новый пароль', url },
    },
    kz: {
      subject: 'Debate.kz — құпиясөзді қалпына келтіру',
      text: `Сәлеметсіз бе, ${u.name}!\n\nЖаңа құпиясөз орнату үшін төмендегі батырманы басыңыз. Сілтеме 1 сағат жарамды және бір рет қана жұмыс істейді.\n\nЕгер қалпына келтіруді сұрамаған болсаңыз, хатты елемей-ақ қойыңыз — құпиясөзіңіз өзгермейді.`,
      action: { label: 'Жаңа құпиясөз орнату', url },
    },
  }[l]
  return {
    ru: {
      subject: 'Debate.kz — задайте пароль',
      text: `Здравствуйте, ${u.name}!\n\nВы входите на Debate.kz через Google. Чтобы входить ещё и по email с паролем, задайте пароль по кнопке ниже. Ссылка действует 1 час и работает один раз.\n\nЕсли вы этого не запрашивали, просто проигнорируйте письмо.`,
      action: { label: 'Задать пароль', url },
    },
    kz: {
      subject: 'Debate.kz — құпиясөз орнатыңыз',
      text: `Сәлеметсіз бе, ${u.name}!\n\nСіз Debate.kz-ке Google арқылы кіресіз. Email мен құпиясөз арқылы да кіру үшін төмендегі батырма арқылы құпиясөз орнатыңыз. Сілтеме 1 сағат жарамды және бір рет қана жұмыс істейді.\n\nЕгер мұны сұрамаған болсаңыз, хатты елемей-ақ қойыңыз.`,
      action: { label: 'Құпиясөз орнату', url },
    },
  }[l]
})

export const passwordChangedLetter = (u: User, firstTime: boolean) => send(u.email, langOf(u), l => ({
  ru: {
    subject: firstTime ? 'Debate.kz — пароль задан' : 'Debate.kz — пароль изменён',
    text: `Здравствуйте, ${u.name}!\n\n${firstTime ? 'Для вашего аккаунта задан пароль' : 'Пароль от вашего аккаунта изменён'} ${when(l)} (время Астаны). Все остальные устройства вышли из аккаунта.\n\n${notYou.ru}`,
  },
  kz: {
    subject: firstTime ? 'Debate.kz — құпиясөз орнатылды' : 'Debate.kz — құпиясөз өзгертілді',
    text: `Сәлеметсіз бе, ${u.name}!\n\n${firstTime ? 'Аккаунтыңызға құпиясөз орнатылды' : 'Аккаунтыңыздың құпиясөзі өзгертілді'}: ${when(l)} (Астана уақыты). Басқа құрылғылардың бәрі аккаунттан шықты.\n\n${notYou.kz}`,
  },
}[l]))

export const welcomeGoogleLetter = (u: User) => send(u.email, langOf(u), l => ({
  ru: {
    subject: 'Добро пожаловать на Debate.kz',
    text: `Здравствуйте, ${u.name}!\n\nВы создали аккаунт на Debate.kz через Google — email уже подтверждён.\n\nДобавьте в профиле телефон, учебное заведение и город, а также вступите в клуб или создайте его: это нужно для заявок на турниры. Пароль не обязателен — входите кнопкой «Войти через Google». Если захотите входить и по паролю, задайте его в профиле.`,
    action: { label: 'Открыть профиль', url: site('/me') },
  },
  kz: {
    subject: 'Debate.kz-ке қош келдіңіз',
    text: `Сәлеметсіз бе, ${u.name}!\n\nСіз Debate.kz-те Google арқылы аккаунт аштыңыз — email расталған.\n\nПрофильге телефон, оқу орны мен қаланы қосып, клубқа кіріңіз немесе клуб құрыңыз: бұл турнирге өтінім беру үшін керек. Құпиясөз міндетті емес — «Google арқылы кіру» батырмасымен кіріңіз. Құпиясөзбен де кіргіңіз келсе, оны профильде орнатыңыз.`,
    action: { label: 'Профильді ашу', url: site('/me') },
  },
}[l]))

export const googleLinkedLetter = (u: User, googleEmail: string, passwordRemoved: boolean) => send(u.email, langOf(u), l => ({
  ru: {
    subject: 'Debate.kz — вход через Google подключён',
    text: `Здравствуйте, ${u.name}!\n\nК вашему аккаунту ${when(l)} (время Астаны) подключён вход через Google (${googleEmail}).${passwordRemoved ? '\n\nEmail этого аккаунта раньше не был подтверждён, поэтому прежний пароль сброшен, а все устройства вышли из аккаунта: так никто, кто мог знать этот пароль, не войдёт вместо вас. Входите через Google или задайте новый пароль в профиле.' : ''}\n\n${notYou.ru}`,
  },
  kz: {
    subject: 'Debate.kz — Google арқылы кіру қосылды',
    text: `Сәлеметсіз бе, ${u.name}!\n\nАккаунтыңызға ${when(l)} (Астана уақыты) Google арқылы кіру қосылды (${googleEmail}).${passwordRemoved ? '\n\nБұл аккаунттың email-і бұрын расталмаған, сондықтан бұрынғы құпиясөз тасталды, ал барлық құрылғылар аккаунттан шықты: осылайша бұл құпиясөзді білуі мүмкін ешкім сіздің орныңызға кіре алмайды. Google арқылы кіріңіз немесе профильде жаңа құпиясөз орнатыңыз.' : ''}\n\n${notYou.kz}`,
  },
}[l]))

export const googleUnlinkedLetter = (u: User, googleEmail: string) => send(u.email, langOf(u), l => ({
  ru: {
    subject: 'Debate.kz — вход через Google отключён',
    text: `Здравствуйте, ${u.name}!\n\nВход через Google (${googleEmail}) отключён от вашего аккаунта ${when(l)} (время Астаны). Входите по email и паролю.\n\n${notYou.ru}`,
  },
  kz: {
    subject: 'Debate.kz — Google арқылы кіру ажыратылды',
    text: `Сәлеметсіз бе, ${u.name}!\n\nGoogle арқылы кіру (${googleEmail}) аккаунтыңыздан ${when(l)} (Астана уақыты) ажыратылды. Email мен құпиясөз арқылы кіріңіз.\n\n${notYou.kz}`,
  },
}[l]))

export const paymentConfirmedLetter = (u: User, tournament: string, reference: string) => send(u.email, langOf(u), l => ({
  ru: {
    subject: 'Debate.kz — оплата Pro подтверждена',
    text: `Здравствуйте, ${u.name}!\n\nОплата тарифа Pro для турнира «${tournament}» подтверждена (код платежа ${reference}). Ограничение по числу команд снято — все функции панели доступны.\n\nСпасибо, что проводите турниры на Debate.kz!`,
    action: { label: 'Открыть мои турниры', url: site('/dashboard') },
  },
  kz: {
    subject: 'Debate.kz — Pro төлемі расталды',
    text: `Сәлеметсіз бе, ${u.name}!\n\n«${tournament}» турниріне Pro тарифінің төлемі расталды (төлем коды ${reference}). Команда санына шектеу алынды — панельдің барлық мүмкіндіктері қолжетімді.\n\nТурнирлерді Debate.kz-те өткізгеніңізге рақмет!`,
    action: { label: 'Менің турнирлерімді ашу', url: site('/dashboard') },
  },
}[l]))

export const paymentRejectedLetter = (u: User, tournament: string, reason: string, tournamentId: string) => send(u.email, langOf(u), l => ({
  ru: {
    subject: 'Debate.kz — оплата Pro не подтверждена',
    text: `Здравствуйте, ${u.name}!\n\nМы не нашли оплату тарифа Pro для турнира «${tournament}».\n\nПричина: ${reason}\n\nПроверьте перевод в Kaspi, прикрепите верный чек в настройках турнира (раздел «Оплата») и отправьте оплату на проверку ещё раз. Если что-то непонятно — напишите на hello@debate.kz.`,
    action: { label: 'Открыть оплату турнира', url: site(`/dashboard/tournaments/${tournamentId}/settings`) },
  },
  kz: {
    subject: 'Debate.kz — Pro төлемі расталмады',
    text: `Сәлеметсіз бе, ${u.name}!\n\n«${tournament}» турниріне Pro тарифінің төлемін таппадық.\n\nСебебі: ${reason}\n\nKaspi-дағы аударымды тексеріп, турнир баптауларында («Төлем» бөлімі) дұрыс чекті тіркеңіз де, төлемді қайта тексеруге жіберіңіз. Түсініксіз болса — hello@debate.kz мекенжайына жазыңыз.`,
    action: { label: 'Турнир төлемін ашу', url: site(`/dashboard/tournaments/${tournamentId}/settings`) },
  },
}[l]))

// an invite by email: to a registered person (in their language) or to someone who still has to sign up (both languages)
export const inviteLetter = (to: string, d: { inviter: string; tournament: string; kind: 'judge' | 'co_organizer'; registered: boolean; url: string; language?: string }) =>
  send(to, d.registered ? (d.language === 'kz' ? 'kz' : 'ru') : 'both', l => ({
    ru: {
      subject: d.kind === 'judge' ? `Debate.kz — приглашение судить «${d.tournament}»` : `Debate.kz — приглашение в организаторы «${d.tournament}»`,
      text: `Здравствуйте!\n\n${d.inviter} приглашает вас ${d.kind === 'judge' ? 'судить турнир' : 'стать соорганизатором турнира'} «${d.tournament}» на Debate.kz.\n\n${d.kind === 'judge'
        ? 'Если вы примете приглашение, вам откроется раздел «Судейство»: назначения на дебаты и онлайн-бюллетени этого турнира. Судить турнир, в котором вы участвуете как спикер, нельзя.'
        : 'Если вы примете приглашение, вы сможете управлять турниром вместе с организатором.'}\n\n${d.registered
        ? 'Войдите в аккаунт с этим email и примите или отклоните приглашение.'
        : 'У вас ещё нет аккаунта: зарегистрируйтесь на Debate.kz с этим email (можно через Google) — после этого приглашение можно принять.'} Ссылка действует 7 дней.\n\nЕсли вы не ждали этого письма, просто проигнорируйте его.`,
      action: { label: 'Открыть приглашение', url: d.url },
    },
    kz: {
      subject: d.kind === 'judge' ? `Debate.kz — «${d.tournament}» турнирінде төрешілікке шақыру` : `Debate.kz — «${d.tournament}» турнирін ұйымдастыруға шақыру`,
      text: `Сәлеметсіз бе!\n\n${d.inviter} сізді Debate.kz-тегі «${d.tournament}» ${d.kind === 'judge' ? 'турнирінде төреші болуға' : 'турнирінің қосалқы ұйымдастырушысы болуға'} шақырады.\n\n${d.kind === 'judge'
        ? 'Шақыруды қабылдасаңыз, «Төрешілік» бөлімі ашылады: осы турнирдегі дебаттарға тағайындаулар мен онлайн бюллетеньдер. Өзіңіз спикер ретінде қатысатын турнирде төреші бола алмайсыз.'
        : 'Шақыруды қабылдасаңыз, турнирді ұйымдастырушымен бірге басқара аласыз.'}\n\n${d.registered
        ? 'Осы email-мен аккаунтқа кіріп, шақыруды қабылдаңыз немесе бас тартыңыз.'
        : 'Сізде әлі аккаунт жоқ: Debate.kz-те осы email-мен тіркеліңіз (Google арқылы да болады) — содан кейін шақыруды қабылдауға болады.'} Сілтеме 7 күн жарамды.\n\nЕгер бұл хатты күтпеген болсаңыз, елемей-ақ қойыңыз.`,
      action: { label: 'Шақыруды ашу', url: d.url },
    },
  }[l]))
