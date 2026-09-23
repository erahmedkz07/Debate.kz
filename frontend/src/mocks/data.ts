import type {
  Debate, Judge, RatingSpeaker, RatingTeam, Round, ScheduleItem, Team, Testimonial, Tournament,
} from '@/types'
import { images } from './images'

export const cities = ['Астана', 'Алматы', 'Шымкент', 'Караганда', 'Актобе', 'Павлодар', 'Усть-Каменогорск', 'Костанай']

export const tournaments: Tournament[] = [
  {
    id: 't1', name: 'Кубок Астаны по дебатам 2026', city: 'Астана', startDate: '2026-10-17', endDate: '2026-10-18',
    format: 'WSDC', level: 'school', status: 'registration', teamsCount: 9, maxTeams: 12, cover: images.podium,
    organizer: 'Дебатный клуб «Шешен»', preliminaryRounds: 4, breakSize: 4, languages: ['ru', 'kz'],
    description: 'Ежегодный школьный турнир для учеников 8–11 классов. Четыре отборочных раунда, полуфиналы и финал в формате World Schools. Лучшие спикеры получат приглашение на республиканский этап.',
  },
  {
    id: 't2', name: 'Almaty Open Debate Cup', city: 'Алматы', startDate: '2026-11-07', endDate: '2026-11-09',
    format: 'WSDC', level: 'university', status: 'registration', teamsCount: 18, maxTeams: 32, cover: images.stageAudience,
    organizer: 'KazNU Debate Society', preliminaryRounds: 5, breakSize: 8, languages: ['ru', 'kz'],
    description: 'Открытый университетский турнир для студентов вузов Казахстана и Центральной Азии. Пять отборочных раундов, четвертьфиналы и финал на главной сцене.',
  },
  {
    id: 't3', name: 'Шымкент Жас Шешендер', city: 'Шымкент', startDate: '2026-10-24', endDate: '2026-10-25',
    format: 'WSDC', level: 'school', status: 'registration', teamsCount: 6, maxTeams: 12, cover: images.handsUp,
    organizer: 'Лицей «Білім-Инновация»', preliminaryRounds: 3, breakSize: 4, languages: ['kz'],
    description: 'Турнир на казахском языке для школьников Туркестанской области и Шымкента. Отличный старт для новичков.',
  },
  {
    id: 't4', name: 'Лига дебатов Караганды — осень', city: 'Караганда', startDate: '2026-09-19', endDate: '2026-09-27',
    format: 'WSDC', level: 'school', status: 'ongoing', teamsCount: 12, maxTeams: 12, cover: images.studentsHall,
    organizer: 'Управление образования Карагандинской области', preliminaryRounds: 4, breakSize: 4, languages: ['ru', 'kz'],
    description: 'Осенний этап городской лиги. Турнир идёт прямо сейчас — следите за жеребьёвкой и результатами онлайн.',
  },
  {
    id: 't5', name: 'Nazarbayev University Debate Open', city: 'Астана', startDate: '2026-09-21', endDate: '2026-09-24',
    format: 'WSDC', level: 'university', status: 'ongoing', teamsCount: 24, maxTeams: 24, cover: images.panel,
    organizer: 'NU Debate Club', preliminaryRounds: 5, breakSize: 8, languages: ['ru'],
    description: 'Один из самых сильных студенческих турниров страны. Сильные судьи, актуальные темы и отличная атмосфера.',
  },
  {
    id: 't6', name: 'Кубок Павлодара', city: 'Павлодар', startDate: '2026-12-05', endDate: '2026-12-06',
    format: 'WSDC', level: 'school', status: 'registration', teamsCount: 3, maxTeams: 16, cover: images.presentation,
    organizer: 'Школа-гимназия №8', preliminaryRounds: 4, breakSize: 4, languages: ['ru'],
    description: 'Первый открытый турнир Павлодара. Приглашаем команды из всех регионов Казахстана.',
  },
  {
    id: 't7', name: 'Республиканский чемпионат школьников', city: 'Алматы', startDate: '2026-05-14', endDate: '2026-05-17',
    format: 'WSDC', level: 'school', status: 'finished', teamsCount: 32, maxTeams: 32, cover: images.audience,
    organizer: 'Debate.kz', preliminaryRounds: 6, breakSize: 16, languages: ['ru', 'kz'],
    description: 'Главный школьный турнир года. 32 команды из 14 областей страны.',
  },
  {
    id: 't8', name: 'Актобе Debate Weekend', city: 'Актобе', startDate: '2026-08-22', endDate: '2026-08-23',
    format: 'WSDC', level: 'university', status: 'finished', teamsCount: 10, maxTeams: 12, cover: images.speakerCrowd,
    organizer: 'АРГУ им. Жубанова', preliminaryRounds: 4, breakSize: 4, languages: ['ru', 'kz'],
    description: 'Летний турнир выходного дня для студентов западного Казахстана.',
  },
  {
    id: 't9', name: 'Костанай — Кубок первокурсника', city: 'Костанай', startDate: '2026-11-21', endDate: '2026-11-22',
    format: 'WSDC', level: 'university', status: 'registration', teamsCount: 5, maxTeams: 12, cover: images.studentsLaugh,
    organizer: 'КРУ им. Байтурсынова', preliminaryRounds: 3, breakSize: 4, languages: ['ru'],
    description: 'Турнир только для первокурсников — идеальный способ познакомиться с дебатами.',
  },
]

const institutions = {
  school: ['НИШ ФМН', 'Лицей №15', 'Гимназия №1', 'Школа-лицей «Дарын»', 'КТЛ', 'Гимназия №65', 'Лицей «Білім-Инновация»', 'Школа №38', 'Haileybury', 'Мирас', 'Гимназия им. Абая', 'Лицей №134', 'НИШ ХБН', 'Школа «Зерде»', 'Гимназия №2', 'Школа-гимназия №8'],
  university: ['Nazarbayev University', 'КазНУ им. аль-Фараби', 'ЕНУ им. Гумилёва', 'Astana IT University', 'КБТУ', 'КИМЭП', 'SDU University', 'AlmaU', 'КазУТБ', 'Satbayev University', 'ЖезУ', 'КарТУ'],
}

const teamNames = ['Орлы', 'Логос', 'Сократ', 'Аргумент', 'Номад', 'Тұлпар', 'Феникс', 'Катарсис', 'Дилемма', 'Парадокс', 'Кредо', 'Гипотеза', 'Вектор', 'Абай', 'Спектр', 'Меридиан',
  'Ратио', 'Сапсан', 'Горизонт', 'Эврика', 'Барыс', 'Максима', 'Ирбис', 'Квант', 'Альтаир', 'Ethos', 'Pathos', 'Тезис', 'Антитезис', 'Синтез', 'Қыран', 'Ақиқат']

const firstNames = ['Айдана', 'Арман', 'Динара', 'Ерлан', 'Алия', 'Тимур', 'Мадина', 'Нурсултан', 'Асель', 'Данияр', 'Камила', 'Алихан', 'Жанель', 'Ислам', 'Томирис', 'Руслан', 'Сабина', 'Ержан',
  'Дана', 'Максим', 'Аружан', 'Санжар', 'Анель', 'Дамир', 'Инкар', 'Артём', 'Меруерт', 'Бекзат', 'Виктория', 'Азамат', 'Амина', 'Олжас']
const lastNames = ['Ахметова', 'Сериков', 'Жумабаева', 'Касымов', 'Нурланова', 'Ибраев', 'Смагулова', 'Оспанов', 'Бекова', 'Мухамедов', 'Ким', 'Абдрахманов', 'Турсунова', 'Садыков', 'Есенова', 'Жаксылыков']

const person = (i: number) => {
  const first = firstNames[i % firstNames.length]
  let last = lastNames[(i * 7 + 3) % lastNames.length]
  // match surname gender to first name (female names mostly end with -а/-я/-ь or are in the list)
  const female = /[аяь]$|Асель|Жанель|Анель|Инкар|Томирис|Меруерт/.test(first) && !/Ислам|Нурсултан|Санжар|Бекзат|Азамат|Олжас/.test(first)
  if (female && !/[аи]$/.test(last) && last !== 'Ким') last += 'а'
  if (!female && /ова$|ева$|ина$/.test(last)) last = last.slice(0, -1)
  return `${first} ${last}`
}

function buildTeams(t: Tournament): Team[] {
  const list = institutions[t.level]
  const offset = Number(t.id.slice(1)) * 3
  return Array.from({ length: t.teamsCount }, (_, i) => {
    const id = `${t.id}-team${i + 1}`
    return {
      id, tournamentId: t.id,
      name: teamNames[(i + offset) % teamNames.length],
      institution: list[(i + offset) % list.length],
      city: i % 3 === 0 ? t.city : cities[(i + offset) % cities.length],
      speakers: [0, 1, 2].map(k => ({ id: `${id}-s${k + 1}`, name: person(i * 3 + k + offset), teamId: id })),
    }
  })
}

function buildJudges(t: Tournament): Judge[] {
  const n = Math.max(4, Math.ceil(t.teamsCount / 2) + 2)
  const list = institutions.university
  return Array.from({ length: n }, (_, i) => ({
    id: `${t.id}-j${i + 1}`, tournamentId: t.id, name: person(i * 5 + 11), institution: list[(i * 2) % list.length],
    rating: 9 - (i % 5), isChair: i < Math.ceil(n / 3),
  }))
}

const motions = [
  'Эта палата считает, что школы должны заменить домашние задания проектной работой',
  'Эта палата запретила бы рекламу, нацеленную на детей до 16 лет',
  'Эта палата считает, что казахстанским вузам следует перейти на обучение полностью на английском языке',
  'Эта палата сожалеет о культуре постоянной продуктивности',
  'Эта палата ввела бы обязательное голосование на выборах',
  'Эта палата считает, что развитые страны должны списать долги беднейшим странам',
  'Эта палата поддерживает использование ИИ-учителей в сельских школах',
]

function buildRounds(t: Tournament): Round[] {
  const done = t.status === 'finished' ? t.preliminaryRounds : t.status === 'ongoing' ? 2 : 0
  return Array.from({ length: t.preliminaryRounds }, (_, i) => ({
    id: `${t.id}-r${i + 1}`, tournamentId: t.id, number: i + 1, name: `Раунд ${i + 1}`,
    motion: motions[(i + Number(t.id.slice(1))) % motions.length],
    status: i < done ? 'completed' : i === done && t.status === 'ongoing' ? 'released' : 'draft',
    date: i < 2 ? t.startDate : t.endDate,
  }))
}

const rooms = ['Ауд. 101', 'Ауд. 102', 'Ауд. 203', 'Ауд. 204', 'Ауд. 305', 'Актовый зал', 'Ауд. 310', 'Ауд. 412', 'Ауд. 415', 'Библиотека', 'Ауд. 501', 'Ауд. 502']

function buildDebates(rounds: Round[], teams: Team[], judges: Judge[]): Debate[] {
  const debates: Debate[] = []
  rounds.filter(r => r.status !== 'draft').forEach(r => {
    const order = teams.map((_, i) => i).sort((a, b) => ((a * (r.number + 2)) % 7) - ((b * (r.number + 2)) % 7) || a - b)
    for (let i = 0; i + 1 < order.length; i += 2) {
      const d = i / 2
      debates.push({
        id: `${r.id}-d${d + 1}`, roundId: r.id, room: rooms[d % rooms.length],
        propositionTeamId: teams[order[i]].id, oppositionTeamId: teams[order[i + 1]].id,
        judgeIds: [judges[d % judges.length].id, judges[(d + 3) % judges.length].id, judges[(d + 5) % judges.length].id].filter((v, k, a) => a.indexOf(v) === k),
        winner: r.status === 'completed' ? ((order[i] + r.number) % 3 === 0 ? 'opposition' : 'proposition') : undefined,
        ballotStatus: r.status === 'completed' ? 'confirmed' : d % 3 === 0 ? 'submitted' : 'pending',
      })
    }
  })
  return debates
}

export const schedule: ScheduleItem[] = [
  { day: 1, time: '09:00', title: 'Регистрация участников' },
  { day: 1, time: '10:00', title: 'Открытие турнира и брифинг судей' },
  { day: 1, time: '10:30', title: 'Раунд 1' },
  { day: 1, time: '12:30', title: 'Раунд 2' },
  { day: 1, time: '14:00', title: 'Обед' },
  { day: 1, time: '15:00', title: 'Раунд 3' },
  { day: 2, time: '10:00', title: 'Раунд 4' },
  { day: 2, time: '12:00', title: 'Объявление брейка' },
  { day: 2, time: '13:00', title: 'Полуфиналы' },
  { day: 2, time: '16:00', title: 'Финал и награждение' },
]

export const tournamentData = Object.fromEntries(tournaments.map(t => {
  const teams = buildTeams(t)
  const judges = buildJudges(t)
  const rounds = buildRounds(t)
  return [t.id, { teams, judges, rounds, debates: buildDebates(rounds, teams, judges) }]
}))

export const ratingTeams: RatingTeam[] = [
  ['Логос', 'НИШ ФМН', 'Астана', 'school', 7, 24, 1864],
  ['Nomad', 'Nazarbayev University', 'Астана', 'university', 8, 29, 2310],
  ['Тұлпар', 'Лицей «Білім-Инновация»', 'Шымкент', 'school', 6, 20, 1702],
  ['Сократ', 'КазНУ им. аль-Фараби', 'Алматы', 'university', 7, 25, 2104],
  ['Аргумент', 'Гимназия №1', 'Караганда', 'school', 6, 19, 1655],
  ['Феникс', 'КБТУ', 'Алматы', 'university', 5, 18, 1590],
  ['Қыран', 'КТЛ', 'Актобе', 'school', 5, 16, 1498],
  ['Парадокс', 'Astana IT University', 'Астана', 'university', 5, 15, 1470],
  ['Кредо', 'Лицей №15', 'Павлодар', 'school', 4, 13, 1320],
  ['Вектор', 'ЕНУ им. Гумилёва', 'Астана', 'university', 4, 12, 1288],
  ['Барыс', 'Гимназия им. Абая', 'Усть-Каменогорск', 'school', 4, 11, 1210],
  ['Эврика', 'SDU University', 'Алматы', 'university', 3, 10, 1105],
]
  .sort((a, b) => (b[6] as number) - (a[6] as number))
  .map((r, i) => ({ rank: i + 1, name: r[0] as string, institution: r[1] as string, city: r[2] as string, level: r[3] as RatingTeam['level'], tournaments: r[4] as number, wins: r[5] as number, points: r[6] as number }))

export const ratingSpeakers: RatingSpeaker[] = Array.from({ length: 15 }, (_, i) => ({
  rank: i + 1, name: person(i * 4 + 1), team: ratingTeams[i % ratingTeams.length].name, city: ratingTeams[i % ratingTeams.length].city,
  level: ratingTeams[i % ratingTeams.length].level, tournaments: 7 - (i % 4), average: Math.round((76.4 - i * 0.37) * 10) / 10,
}))

export const testimonials: Testimonial[] = [
  { name: 'Гульнара Сейтова', role: 'Учитель, тренер дебатного клуба, Караганда', text: 'Раньше жеребьёвку мы делали в Excel до двух ночи. Теперь это одна кнопка, а результаты дети видят сразу на телефоне.' },
  { name: 'Арсен Нурбеков', role: 'Ученик 10 класса, НИШ Астана', text: 'Удобно, что всё в одном месте: темы, комнаты, судьи и мои баллы. И на казахском, и на русском.' },
  { name: 'Мария Ли', role: 'Судья, КазНУ Debate Society', text: 'Бюллетень заполняю прямо с телефона за пару минут. Система сама проверяет, чтобы победитель совпадал с баллами.' },
]

export const stats = { tournaments: 148, teams: 1240, debaters: 3720, cities: 17 }
