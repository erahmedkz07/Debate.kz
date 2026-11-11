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

// the main menu: sent with a message, it stays under the message box until another keyboard replaces it
export const menuOptions = (l: Lang, extra: SendOptions = {}): SendOptions => ({ ...extra, menu: menuRows(l), placeholder: M[l].menuHint })
