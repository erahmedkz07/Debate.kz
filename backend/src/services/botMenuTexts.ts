import { esc, type InlineButton, type SendOptions } from '../lib/telegram.js'
import type { Lang } from './botTexts.js'

// What the bot says around its main menu: the menu buttons, finding a tournament, a tournament's card, its table,
// the person's results, an organizer's decision on an application. Values from the database are escaped (parse_mode=HTML).

const s = (v: unknown) => esc(String(v ?? ''))
const b = (v: unknown) => `<b>${s(v)}</b>`
const q = (v: unknown) => `«${s(v)}»`

export interface Card {
  name: string; dates: string; city: string; format: string; level: string; status: string
  teams: number; maxTeams: number; deadline?: string; organizer?: string; venue?: string
}
export interface ResultRow { name: string; date: string; team: string; place?: number; teams: number; inBreak: boolean; speakerRank?: number; average?: number; live: boolean }

const FORMAT: Record<string, string> = { WSDC: 'WSDC', APF: 'АПФ', POPPER: 'Карл Поппер', BP: 'BP (британский)', LD: 'Линкольн — Дуглас', PF: 'Public Forum', ASIAN: 'Азиатский парламентский', AUSTRALS: 'Australs' }
const FORMAT_KZ: Record<string, string> = { ...FORMAT, POPPER: 'Карл Поппер', BP: 'BP (британдық)', LD: 'Линкольн — Дуглас', ASIAN: 'Азиялық парламенттік' }

const ru = {
  // the menu under the message box: always there, one tap instead of a command
  menu: {
    next: '📍 Сейчас', tournaments: '🏆 Мои турниры', find: '🔎 Найти турнир', apply: '📝 Подать заявку',
    checkin: '✅ Отметиться', club: '👥 Мой клуб', results: '📊 Мои результаты', me: '⚙️ Профиль',
  } as Record<string, string>,
  menuHint: 'Выберите в меню внизу 👇',
  menuShown: 'Меню внизу — всё главное в одно касание 👇',
  level: { school: 'школьники', university: 'студенты', mixed: 'школьники и студенты' } as Record<string, string>,
  format: FORMAT,
  status: { registration: '🟢 идёт регистрация', ongoing: '🔴 идёт сейчас', finished: '🏁 завершён' } as Record<string, string>,
  card: (c: Card) => [
    `🏆 ${b(c.name)}`,
    `📅 ${s(c.dates)} · 📍 ${s(c.city)}${c.venue ? `, ${s(c.venue)}` : ''}`,
    `🎙 ${s(c.format)} · 🎓 ${s(c.level)}`,
    `👥 Команд: ${b(c.teams)} из ${s(c.maxTeams)}${c.deadline ? ` · ⏳ заявки до ${s(c.deadline)}` : ''}`,
    `${c.status}${c.organizer ? ` · организатор: ${s(c.organizer)}` : ''}`,
  ].join('\n'),
  findHead: (n: number) => `🔎 <b>Ближайшие турниры</b> — ${n}`,
  findNone: 'Сейчас нет открытых турниров. Я напишу, когда появятся новые — следите за уведомлениями.',
  more: '➡️ Ещё турниры',
  apply: '📝 Подать заявку',
  details: 'ℹ️ Подробнее',
  onSite: '🌐 На сайте',
  table: '📋 Таблица',
  myDraw: '📍 Моя жеребьёвка',
  register: '📝 Зарегистрироваться',
  outside: (url: string) => `Регистрация на этот турнир — на сайте организатора:\n${s(url)}`,
  yourRole: (roles: string) => `Ваша роль: ${b(roles)}`,
  currentRound: (round: string) => `Сейчас: ${b(round)}`,
  notFound: 'Турнир не найден или скрыт.',
  tableHead: (name: string, bp: boolean) => `📋 ${b(name)} — таблица\n<i>${bp ? 'очки команды · спикерские баллы' : 'победы · спикерские баллы'}</i>`,
  tableNone: 'Таблица появится после первого завершённого раунда.',
  tableHidden: 'Часть раундов закрыта до брейка — таблица по открытым раундам.',
  yourTeam: '← ваша команда',
  resultsHead: '📊 <b>Мои результаты</b>',
  resultsNone: 'Пока нет результатов: они появятся после первого раунда вашего турнира.',
  resultsTotal: (n: number, debates: number, wins: number) => `Турниров: ${b(n)} · дебатов: ${b(debates)} · побед: ${b(wins)}`,
  resultRow: (r: ResultRow) => [
    `${r.live ? '🔴' : r.place === 1 ? '🥇' : r.place === 2 ? '🥈' : r.place === 3 ? '🥉' : '🏆'} ${b(r.name)} · ${s(r.date)}`,
    `   ${q(r.team)}${r.place ? ` — ${r.live ? 'сейчас ' : ''}${b(`${r.place} место`)} из ${s(r.teams)}` : ''}${r.inBreak ? ' · брейк' : ''}`,
    ...(r.speakerRank ? [`   Спикер: ${s(r.speakerRank)} место, средний балл ${b(r.average)}`] : []),
  ].join('\n'),
  judgeLine: (rounds: number, chaired: number) => `⚖️ Судейство: ${b(rounds)} раундов, из них председателем — ${b(chaired)}`,
  certificates: '📜 Сертификаты',
  profile: '👤 Мой профиль',
  // an organizer decides on an application right under the notification
  regInfo: (d: { speakers: string[]; institution?: string; taken: number; max: number }) =>
    `${d.speakers.length ? `\nСпикеры: ${d.speakers.map(s).join(', ')}` : ''}${d.institution ? `\nШкола / вуз: ${s(d.institution)}` : ''}\nМест занято: ${s(d.taken)} из ${s(d.max)}`,
  regConfirm: '✅ Принять',
  regWait: '⏳ В ожидание',
  regReject: '❌ Отклонить',
  regDone: { confirmed: '✅ Вы приняли заявку.', waitlisted: '⏳ Вы поставили заявку в лист ожидания.', rejected: '❌ Вы отклонили заявку.' } as Record<string, string>,
  regAlready: 'Эту заявку уже рассмотрели.',
  // the tournament day for organizers: the round, the ballots, check-in, reminders, announcements
  dayButton: '📊 Ход турнира',
  announceButton: '📣 Объявление',
  dayHead: (name: string) => `📊 ${b(name)} — ход турнира`,
  dayNoRound: 'Раунды ещё не опубликованы.',
  dayRound: (name: string, released: boolean) => `${released ? '🔴' : '✅'} ${b(name)} — ${released ? 'идёт' : 'завершён'}`,
  dayBallots: (done: number, total: number) => `🗳 Бюллетени: ${b(`${done} из ${total}`)}`,
  dayWaiting: 'Ждём бюллетень:',
  dayRoom: (room: string, judges: string) => `• ${b(room)} — ${judges}`,
  noAccount: 'без аккаунта',
  dayAllIn: '✅ Все бюллетени сданы — раунд можно завершать на сайте.',
  dayCheckin: (present: number, total: number) => `🏁 Отметились: ${b(`${present} из ${total}`)}`,
  dayAbsent: (names: string[], more: number) => `   Нет: ${names.map(s).join(', ')}${more ? ` и ещё ${more}` : ''}`,
  remind: '🔔 Напомнить судьям',
  refresh: '🔄 Обновить',
  manage: '🗂 Управление',
  reminded: (sent: number, offline: number) => `🔔 Напоминание отправлено судьям: ${b(sent)}.${offline ? `\nБез аккаунта — напомните лично: ${b(offline)}.` : ''}`,
  remindedNone: (offline: number) => (offline ? `Судьям с аккаунтом уже напомнили недавно. Без аккаунта — напомните лично: ${b(offline)}.` : 'Все бюллетени уже сданы или напоминание ушло только что.'),
  nextDay: (name: string) => `🔴 ${b(name)} идёт — посмотрите ход раунда и бюллетени.`,
  announceAsk: (name: string) => `📣 Объявление для всех участников и судей турнира ${b(name)}.\n\nНапишите текст одним сообщением (до 1000 знаков).`,
  announceBad: 'Текст должен быть от 3 до 1000 знаков. Напишите ещё раз.',
  announcePreview: (name: string, text: string) => `Так увидят все участники и судьи ${b(name)}:\n\n📣 ${s(text)}\n\nОтправить?`,
  announceSend: '📨 Отправить всем',
  announceEdit: '✏️ Изменить',
  announceDone: (n: number) => `✅ Объявление отправлено: ${b(n)} чел. (в Telegram и в уведомлениях на сайте).`,
  announceSoon: 'Объявление только что отправлено — следующее можно через минуту.',
  // subscription to new tournaments (also without an account)
  subscribeButton: '🔔 Подписка на турниры',
  subscribeCity: 'В каком городе сообщать о новых турнирах?',
  subscribeAllCities: '🌍 Все города',
  subscribeLevel: 'Для кого турниры?',
  subscribeLevels: { school: '🎒 Школьники', university: '🎓 Студенты', all: '👥 Все' } as Record<string, string>,
  subscribeDone: (where: string, who: string) => `✅ Готово! Как только откроется регистрация на новый турнир (${where}, ${who}), я пришлю его карточку с кнопкой заявки.`,
  subscribeNow: (where: string, who: string) => `🔔 Вы подписаны на новые турниры: ${b(where)}, ${b(who)}.`,
  subscribeNone: 'Вы пока не подписаны. Я могу писать, как только открывается регистрация на новый турнир.',
  subscribeChange: '✏️ Изменить',
  subscribeOff: '🔕 Отписаться',
  subscribeStart: '🔔 Подписаться',
  subscribeGone: 'Подписка отключена. Вернуть можно в любой момент: /subscribe',
  anyCity: 'все города',
  newTournament: (card: string) => `🆕 <b>Открыта регистрация!</b>\n\n${card}`,
  // ratings right in the chat: the judges of a debate, the tournament
  rateJudges: '⭐ Оценить судей',
  rateJudgesHead: 'Оцените судей вашего дебата — оценку видят только организаторы, она помогает им распределять судей.',
  rateJudge: (name: string) => `⚖️ ${b(name)}`,
  rated: (name: string, score: number) => `Спасибо! ${'⭐'.repeat(score)} — ${s(name)}. Оценку можно изменить, нажав другую звезду.`,
  ratedTournament: (score: number) => `Спасибо за оценку ${'⭐'.repeat(score)}! Комментарий можно добавить на странице турнира — организаторы его прочитают.`,
  // sharing a tournament in any chat: @bot name
  inlineOpen: '🤖 Открыть в боте',
  inlineApply: '📝 Подать заявку',
  inlineEmpty: 'Турниры не найдены',
  inlineHint: 'Напишите название турнира',
}

const kz: typeof ru = {
  menu: {
    next: '📍 Қазір', tournaments: '🏆 Турнирлерім', find: '🔎 Турнир іздеу', apply: '📝 Өтінім беру',
    checkin: '✅ Белгілену', club: '👥 Клубым', results: '📊 Нәтижелерім', me: '⚙️ Профиль',
  },
  menuHint: 'Төмендегі мәзірден таңдаңыз 👇',
  menuShown: 'Мәзір төменде — бәрі бір басумен 👇',
  level: { school: 'оқушылар', university: 'студенттер', mixed: 'оқушылар мен студенттер' },
  format: FORMAT_KZ,
  status: { registration: '🟢 тіркеу жүріп жатыр', ongoing: '🔴 қазір өтіп жатыр', finished: '🏁 аяқталды' },
  card: c => [
    `🏆 ${b(c.name)}`,
    `📅 ${s(c.dates)} · 📍 ${s(c.city)}${c.venue ? `, ${s(c.venue)}` : ''}`,
    `🎙 ${s(c.format)} · 🎓 ${s(c.level)}`,
    `👥 Командалар: ${b(c.teams)} / ${s(c.maxTeams)}${c.deadline ? ` · ⏳ өтінім ${s(c.deadline)} дейін` : ''}`,
    `${c.status}${c.organizer ? ` · ұйымдастырушы: ${s(c.organizer)}` : ''}`,
  ].join('\n'),
  findHead: n => `🔎 <b>Жақын турнирлер</b> — ${n}`,
  findNone: 'Қазір ашық турнир жоқ. Жаңалары шыққанда жазамын — хабарламаларды қадағалаңыз.',
  more: '➡️ Тағы турнирлер',
  apply: '📝 Өтінім беру',
  details: 'ℹ️ Толығырақ',
  onSite: '🌐 Сайтта',
  table: '📋 Кесте',
  myDraw: '📍 Менің жеребем',
  register: '📝 Тіркелу',
  outside: url => `Бұл турнирге тіркеу — ұйымдастырушының сайтында:\n${s(url)}`,
  yourRole: roles => `Сіздің рөліңіз: ${b(roles)}`,
  currentRound: round => `Қазір: ${b(round)}`,
  notFound: 'Турнир табылмады немесе жасырын.',
  tableHead: (name, bp) => `📋 ${b(name)} — кесте\n<i>${bp ? 'команда ұпайы · спикер балдары' : 'жеңістер · спикер балдары'}</i>`,
  tableNone: 'Кесте бірінші раунд аяқталғаннан кейін шығады.',
  tableHidden: 'Кейбір раундтар брейкке дейін жабық — кесте ашық раундтар бойынша.',
  yourTeam: '← сіздің командаңыз',
  resultsHead: '📊 <b>Менің нәтижелерім</b>',
  resultsNone: 'Әзірге нәтиже жоқ: олар турниріңіздің бірінші раундынан кейін шығады.',
  resultsTotal: (n, debates, wins) => `Турнирлер: ${b(n)} · дебаттар: ${b(debates)} · жеңістер: ${b(wins)}`,
  resultRow: r => [
    `${r.live ? '🔴' : r.place === 1 ? '🥇' : r.place === 2 ? '🥈' : r.place === 3 ? '🥉' : '🏆'} ${b(r.name)} · ${s(r.date)}`,
    `   ${q(r.team)}${r.place ? ` — ${r.live ? 'қазір ' : ''}${s(r.teams)} команданың ішінде ${b(`${r.place}-орын`)}` : ''}${r.inBreak ? ' · брейк' : ''}`,
    ...(r.speakerRank ? [`   Спикер: ${s(r.speakerRank)}-орын, орташа балл ${b(r.average)}`] : []),
  ].join('\n'),
  judgeLine: (rounds, chaired) => `⚖️ Төрешілік: ${b(rounds)} раунд, оның ішінде төраға — ${b(chaired)}`,
  certificates: '📜 Сертификаттар',
  profile: '👤 Менің профилім',
  regInfo: d =>
    `${d.speakers.length ? `\nСпикерлер: ${d.speakers.map(s).join(', ')}` : ''}${d.institution ? `\nМектеп / ЖОО: ${s(d.institution)}` : ''}\nОрын: ${s(d.taken)} / ${s(d.max)}`,
  regConfirm: '✅ Қабылдау',
  regWait: '⏳ Күту тізіміне',
  regReject: '❌ Қабылдамау',
  regDone: { confirmed: '✅ Сіз өтінімді қабылдадыңыз.', waitlisted: '⏳ Сіз өтінімді күту тізіміне қойдыңыз.', rejected: '❌ Сіз өтінімді қабылдамадыңыз.' },
  regAlready: 'Бұл өтінім қаралып қойған.',
  dayButton: '📊 Турнир барысы',
  announceButton: '📣 Хабарландыру',
  dayHead: name => `📊 ${b(name)} — турнир барысы`,
  dayNoRound: 'Раундтар әлі жарияланбаған.',
  dayRound: (name, released) => `${released ? '🔴' : '✅'} ${b(name)} — ${released ? 'жүріп жатыр' : 'аяқталды'}`,
  dayBallots: (done, total) => `🗳 Бюллетеньдер: ${b(`${done} / ${total}`)}`,
  dayWaiting: 'Бюллетень күтілуде:',
  dayRoom: (room, judges) => `• ${b(room)} — ${judges}`,
  noAccount: 'аккаунтсыз',
  dayAllIn: '✅ Барлық бюллетень тапсырылды — раундты сайтта аяқтауға болады.',
  dayCheckin: (present, total) => `🏁 Белгіленді: ${b(`${present} / ${total}`)}`,
  dayAbsent: (names, more) => `   Жоқ: ${names.map(s).join(', ')}${more ? ` және тағы ${more}` : ''}`,
  remind: '🔔 Төрешілерге еске салу',
  refresh: '🔄 Жаңарту',
  manage: '🗂 Басқару',
  reminded: (sent, offline) => `🔔 Еске салу жіберілді, төрешілер: ${b(sent)}.${offline ? `\nАккаунтсыз — өзіңіз ескертіңіз: ${b(offline)}.` : ''}`,
  remindedNone: offline => (offline ? `Аккаунты бар төрешілерге жақында ескертілді. Аккаунтсыз — өзіңіз ескертіңіз: ${b(offline)}.` : 'Барлық бюллетень тапсырылған немесе еске салу жаңа ғана жіберілді.'),
  nextDay: name => `🔴 ${b(name)} жүріп жатыр — раунд барысы мен бюллетеньдерді қараңыз.`,
  announceAsk: name => `📣 ${b(name)} турнирінің барлық қатысушысы мен төрешісіне хабарландыру.\n\nМәтінді бір хабарламамен жазыңыз (1000 таңбаға дейін).`,
  announceBad: 'Мәтін 3-тен 1000 таңбаға дейін болуы керек. Қайта жазыңыз.',
  announcePreview: (name, text) => `${b(name)} қатысушылары мен төрешілері былай көреді:\n\n📣 ${s(text)}\n\nЖіберу керек пе?`,
  announceSend: '📨 Барлығына жіберу',
  announceEdit: '✏️ Өзгерту',
  announceDone: n => `✅ Хабарландыру жіберілді: ${b(n)} адам (Telegram-да және сайттағы хабарламаларда).`,
  announceSoon: 'Хабарландыру жаңа ғана жіберілді — келесісін бір минуттан кейін жіберуге болады.',
  subscribeButton: '🔔 Турнирлерге жазылу',
  subscribeCity: 'Жаңа турнирлер туралы қай қала бойынша хабарлайын?',
  subscribeAllCities: '🌍 Барлық қала',
  subscribeLevel: 'Турнирлер кімге арналған?',
  subscribeLevels: { school: '🎒 Оқушылар', university: '🎓 Студенттер', all: '👥 Барлығы' },
  subscribeDone: (where, who) => `✅ Дайын! Жаңа турнирге тіркеу ашылған бойда (${where}, ${who}) оның өтінім батырмасы бар карточкасын жіберемін.`,
  subscribeNow: (where, who) => `🔔 Сіз жаңа турнирлерге жазылғансыз: ${b(where)}, ${b(who)}.`,
  subscribeNone: 'Сіз әлі жазылмағансыз. Жаңа турнирге тіркеу ашылған бойда хабарлай аламын.',
  subscribeChange: '✏️ Өзгерту',
  subscribeOff: '🔕 Жазылудан бас тарту',
  subscribeStart: '🔔 Жазылу',
  subscribeGone: 'Жазылым өшірілді. Кез келген уақытта қайта қосуға болады: /subscribe',
  anyCity: 'барлық қала',
  newTournament: card => `🆕 <b>Тіркеу ашылды!</b>\n\n${card}`,
  rateJudges: '⭐ Төрешілерді бағалау',
  rateJudgesHead: 'Дебатыңыздың төрешілерін бағалаңыз — бағаны тек ұйымдастырушылар көреді, ол төрешілерді бөлуге көмектеседі.',
  rateJudge: name => `⚖️ ${b(name)}`,
  rated: (name, score) => `Рақмет! ${'⭐'.repeat(score)} — ${s(name)}. Басқа жұлдызды басып, бағаны өзгертуге болады.`,
  ratedTournament: score => `Бағаңызға рақмет ${'⭐'.repeat(score)}! Пікірді турнир бетінде қосуға болады — ұйымдастырушылар оқиды.`,
  inlineOpen: '🤖 Ботта ашу',
  inlineApply: '📝 Өтінім беру',
  inlineEmpty: 'Турнир табылмады',
  inlineHint: 'Турнир атауын жазыңыз',
}

export const M: Record<Lang, typeof ru> = { ru, kz }

// a menu button's text (in either language) -> its command
export const MENU_ORDER = [['next', 'tournaments'], ['find', 'apply'], ['checkin', 'club'], ['results', 'me']]
const byLabel = new Map<string, string>()
for (const l of [ru, kz]) for (const [cmd, label] of Object.entries(l.menu)) byLabel.set(label, cmd)
export const menuCommand = (text: string) => byLabel.get(text.trim())
export const menuRows = (l: Lang) => MENU_ORDER.map(row => row.map(cmd => M[l].menu[cmd]))

// an organizer decides on a new application right under its notification
export const registrationButtons = (l: Lang, regId: string): InlineButton[][] => [[
  { text: M[l].regConfirm, callback_data: `rd:${regId}:confirmed` },
  { text: M[l].regWait, callback_data: `rd:${regId}:waitlisted` },
  { text: M[l].regReject, callback_data: `rd:${regId}:rejected` },
]]

// the buttons under the notifications: "rate the judges" after a round, stars after the tournament
export const rateJudgesButton = (l: Lang, debateId: string): InlineButton[][] => [[{ text: M[l].rateJudges, callback_data: `fr:${debateId}` }]]
export const tournamentStars = (tournamentId: string): InlineButton[][] => [[1, 2, 3, 4, 5].map(n => ({ text: `${n}⭐`, callback_data: `rt:${tournamentId}:${n}` }))]

// the main menu: sent with a message, it stays under the message box until another keyboard replaces it
export const menuOptions = (l: Lang, extra: SendOptions = {}): SendOptions => ({ ...extra, menu: menuRows(l), placeholder: M[l].menuHint })
