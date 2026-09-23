// Development seed: realistic tournaments, teams, judges, draws and real WSDC ballots.
// Run: npm run db:seed  (wipes all data first — never run against production)
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type ModerationStatus, type Role, type Side, type TournamentLevel, type TournamentStatus } from '../src/generated/prisma/client.js'

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed a production database')
  process.exit(1)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

// deterministic PRNG so every seed produces the same data
let seed = 20260923
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const half = (v: number) => Math.round(v * 2) / 2
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const day = (s: string) => new Date(`${s}T00:00:00.000Z`)

const img = (id: string, w = 1200) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=75`
const images = {
  heroSpeaker: img('photo-1715610258704-e8f9f5710fe0', 1400), podium: img('photo-1715610237622-748477adf2e4'),
  speakerCrowd: img('photo-1544531586-fde5298cdd40'), studentsHall: img('photo-1758270704763-22072a90d3b6'),
  studentsLaugh: img('photo-1522202176988-66273c2fd55f'), audience: img('photo-1540575467063-178a50c2df87'),
  stageAudience: img('photo-1587825140708-dfaf72ae4b04'), panel: img('photo-1582192730841-2a682d7375f9'),
  handsUp: img('photo-1550305080-4e029753abcf'), presentation: img('photo-1733222814719-9c756a54ad92'),
}

interface T {
  key: string; name: string; city: string; startDate: string; endDate: string; level: TournamentLevel; status: TournamentStatus
  teamsCount: number; maxTeams: number; cover: string; organizer: string; prelims: number; breakSize: number; languages: string[]; description: string
  owner?: 'org' | 'dinara'; moderation?: ModerationStatus
}

const tournaments: T[] = [
  { key: 't1', owner: 'org', name: 'Кубок Астаны по дебатам 2026', city: 'Астана', startDate: '2026-10-17', endDate: '2026-10-18', level: 'school', status: 'registration', teamsCount: 8, maxTeams: 12, cover: images.podium, organizer: 'Дебатный клуб «Шешен»', prelims: 4, breakSize: 4, languages: ['ru', 'kz'], description: 'Ежегодный школьный турнир для учеников 8–11 классов. Четыре отборочных раунда, полуфиналы и финал в формате World Schools. Лучшие спикеры получат приглашение на республиканский этап.' },
  { key: 't2', name: 'Almaty Open Debate Cup', city: 'Алматы', startDate: '2026-11-07', endDate: '2026-11-09', level: 'university', status: 'registration', teamsCount: 18, maxTeams: 32, cover: images.stageAudience, organizer: 'KazNU Debate Society', prelims: 5, breakSize: 8, languages: ['ru', 'kz'], description: 'Открытый университетский турнир для студентов вузов Казахстана и Центральной Азии. Пять отборочных раундов, четвертьфиналы и финал на главной сцене.' },
  { key: 't3', name: 'Шымкент Жас Шешендер', city: 'Шымкент', startDate: '2026-10-24', endDate: '2026-10-25', level: 'school', status: 'registration', teamsCount: 6, maxTeams: 12, cover: images.handsUp, organizer: 'Лицей «Білім-Инновация»', prelims: 3, breakSize: 4, languages: ['kz'], description: 'Турнир на казахском языке для школьников Туркестанской области и Шымкента. Отличный старт для новичков.' },
  { key: 't4', owner: 'org', name: 'Лига дебатов Караганды — осень', city: 'Караганда', startDate: '2026-09-19', endDate: '2026-09-27', level: 'school', status: 'ongoing', teamsCount: 12, maxTeams: 12, cover: images.studentsHall, organizer: 'Дебатный клуб «Шешен»', prelims: 4, breakSize: 4, languages: ['ru', 'kz'], description: 'Осенний этап городской лиги. Турнир идёт прямо сейчас — следите за жеребьёвкой и результатами онлайн.' },
  { key: 't5', name: 'Nazarbayev University Debate Open', city: 'Астана', startDate: '2026-09-21', endDate: '2026-09-24', level: 'university', status: 'ongoing', teamsCount: 24, maxTeams: 24, cover: images.panel, organizer: 'NU Debate Club', prelims: 5, breakSize: 8, languages: ['ru'], description: 'Один из самых сильных студенческих турниров страны. Сильные судьи, актуальные темы и отличная атмосфера.' },
  { key: 't6', name: 'Кубок Павлодара', city: 'Павлодар', startDate: '2026-12-05', endDate: '2026-12-06', level: 'school', status: 'registration', teamsCount: 4, maxTeams: 16, cover: images.presentation, organizer: 'Школа-гимназия №8', prelims: 4, breakSize: 4, languages: ['ru'], description: 'Первый открытый турнир Павлодара. Приглашаем команды из всех регионов Казахстана.' },
  { key: 't7', owner: 'org', name: 'Республиканский чемпионат школьников', city: 'Алматы', startDate: '2026-05-14', endDate: '2026-05-17', level: 'school', status: 'finished', teamsCount: 32, maxTeams: 32, cover: images.audience, organizer: 'Debate.kz', prelims: 6, breakSize: 16, languages: ['ru', 'kz'], description: 'Главный школьный турнир года. 32 команды из 14 областей страны.' },
  { key: 't8', name: 'Актобе Debate Weekend', city: 'Актобе', startDate: '2026-08-22', endDate: '2026-08-23', level: 'university', status: 'finished', teamsCount: 10, maxTeams: 12, cover: images.speakerCrowd, organizer: 'АРГУ им. Жубанова', prelims: 4, breakSize: 4, languages: ['ru', 'kz'], description: 'Летний турнир выходного дня для студентов западного Казахстана.' },
  // waits for admin moderation: not visible in the public list
  { key: 't10', owner: 'dinara', moderation: 'pending', name: 'Осенний кубок Лицея №15', city: 'Павлодар', startDate: '2026-11-28', endDate: '2026-11-29', level: 'school', status: 'registration', teamsCount: 0, maxTeams: 12, cover: images.handsUp, organizer: 'Лицей №15', prelims: 3, breakSize: 4, languages: ['ru', 'kz'], description: 'Первый турнир дебатного клуба лицея. Ждёт проверки администратором.' },
  { key: 't9', name: 'Костанай — Кубок первокурсника', city: 'Костанай', startDate: '2026-11-21', endDate: '2026-11-22', level: 'university', status: 'registration', teamsCount: 6, maxTeams: 12, cover: images.studentsLaugh, organizer: 'КРУ им. Байтурсынова', prelims: 3, breakSize: 4, languages: ['ru'], description: 'Турнир только для первокурсников — идеальный способ познакомиться с дебатами.' },
]

const cities = ['Астана', 'Алматы', 'Шымкент', 'Караганда', 'Актобе', 'Павлодар', 'Усть-Каменогорск', 'Костанай']
const institutions = {
  school: ['НИШ ФМН', 'Лицей №15', 'Гимназия №1', 'Школа-лицей «Дарын»', 'КТЛ', 'Гимназия №65', 'Лицей «Білім-Инновация»', 'Школа №38', 'Haileybury', 'Мирас', 'Гимназия им. Абая', 'Лицей №134', 'НИШ ХБН', 'Школа «Зерде»', 'Гимназия №2', 'Школа-гимназия №8'],
  university: ['Nazarbayev University', 'КазНУ им. аль-Фараби', 'ЕНУ им. Гумилёва', 'Astana IT University', 'КБТУ', 'КИМЭП', 'SDU University', 'AlmaU', 'КазУТБ', 'Satbayev University', 'ЖезУ', 'КарТУ'],
}
const teamNames = ['Орлы', 'Логос', 'Сократ', 'Аргумент', 'Номад', 'Тұлпар', 'Феникс', 'Катарсис', 'Дилемма', 'Парадокс', 'Кредо', 'Гипотеза', 'Вектор', 'Абай', 'Спектр', 'Меридиан',
  'Ратио', 'Сапсан', 'Горизонт', 'Эврика', 'Барыс', 'Максима', 'Ирбис', 'Квант', 'Альтаир', 'Ethos', 'Pathos', 'Тезис', 'Антитезис', 'Синтез', 'Қыран', 'Ақиқат']
const firstNames = ['Айдана', 'Арман', 'Динара', 'Ерлан', 'Алия', 'Тимур', 'Мадина', 'Нурсултан', 'Асель', 'Данияр', 'Камила', 'Алихан', 'Жанель', 'Ислам', 'Томирис', 'Руслан', 'Сабина', 'Ержан',
  'Дана', 'Максим', 'Аружан', 'Санжар', 'Анель', 'Дамир', 'Инкар', 'Артём', 'Меруерт', 'Бекзат', 'Виктория', 'Азамат', 'Амина', 'Олжас']
const lastNames = ['Ахметова', 'Сериков', 'Жумабаева', 'Касымов', 'Нурланова', 'Ибраев', 'Смагулова', 'Оспанов', 'Бекова', 'Мухамедов', 'Ким', 'Абдрахманов', 'Турсунова', 'Садыков', 'Есенова', 'Жаксылыков']
const male = /^(Арман|Ерлан|Тимур|Нурсултан|Данияр|Алихан|Ислам|Руслан|Ержан|Максим|Санжар|Дамир|Артём|Бекзат|Азамат|Олжас)$/

const person = (i: number) => {
  const first = firstNames[i % firstNames.length]
  let last = lastNames[(i * 7 + 3) % lastNames.length]
  const isMale = male.test(first)
  if (!isMale && !/[аи]$/.test(last) && last !== 'Ким') last += 'а'
  if (isMale && /(ова|ева|ина)$/.test(last)) last = last.slice(0, -1)
  return `${first} ${last}`
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
const schedule = [
  [1, '09:00', 'Регистрация участников'], [1, '10:00', 'Открытие турнира и брифинг судей'], [1, '10:30', 'Раунд 1'],
  [1, '12:30', 'Раунд 2'], [1, '14:00', 'Обед'], [1, '15:00', 'Раунд 3'], [2, '10:00', 'Раунд 4'],
  [2, '12:00', 'Объявление брейка'], [2, '13:00', 'Полуфиналы'], [2, '16:00', 'Финал и награждение'],
] as const
const rooms = ['Ауд. 101', 'Ауд. 102', 'Ауд. 203', 'Ауд. 204', 'Ауд. 305', 'Актовый зал', 'Ауд. 310', 'Ауд. 412', 'Ауд. 415', 'Библиотека', 'Ауд. 501', 'Ауд. 502',
  'Ауд. 601', 'Ауд. 602', 'Ауд. 603', 'Ауд. 604']

async function main() {
  console.log('Wiping data…')
  await prisma.$transaction([
    prisma.speakerScore.deleteMany(), prisma.ballot.deleteMany(), prisma.debateJudge.deleteMany(), prisma.debate.deleteMany(),
    prisma.round.deleteMany(), prisma.speaker.deleteMany(), prisma.team.deleteMany(), prisma.judge.deleteMany(),
    prisma.teamRegistration.deleteMany(), prisma.scheduleItem.deleteMany(), prisma.scoringConfig.deleteMany(),
    prisma.tournamentOrganizer.deleteMany(), prisma.tournament.deleteMany(), prisma.institution.deleteMany(),
    prisma.user.deleteMany(), prisma.testimonial.deleteMany(),
  ])

  // ---------- users (demo password: demo1234) ----------
  const hash = await bcrypt.hash('demo1234', 12)
  // everyone is a plain "user"; organizer/judge rights come from tournaments. Demo accounts are pre-verified.
  const mkUser = (email: string, name: string, role: Role, extra: Partial<{ phone: string; institution: string; city: string; blocked: boolean; createdAt: Date }> = {}) =>
    prisma.user.create({ data: { email, name, role, passwordHash: hash, emailVerifiedAt: extra.createdAt ?? new Date(), consentAt: extra.createdAt ?? new Date(), ...extra } })

  const admin = await mkUser('admin@debate.kz', 'Администратор Debate.kz', 'admin', { city: 'Астана', createdAt: day('2026-01-10') })
  const org = await mkUser('org@debate.kz', 'Аргын Ахмед', 'user', { phone: '+7 701 111 22 33', institution: 'Дебатный клуб «Шешен»', city: 'Астана', createdAt: day('2026-02-01') })
  const dinara = await mkUser('dinara@mail.kz', 'Динара Касымова', 'user', { institution: 'Лицей №15', city: 'Павлодар', createdAt: day('2026-05-20') })
  await mkUser('timur@mail.kz', 'Тимур Оспанов', 'user', { institution: 'КазНУ им. аль-Фараби', city: 'Алматы', createdAt: day('2026-06-11') })
  await mkUser('aruzhan@mail.kz', 'Аружан Бекова', 'user', { institution: 'НИШ ФМН', city: 'Астана', createdAt: day('2026-07-03') })
  await mkUser('maxim@mail.kz', 'Максим Ким', 'user', { institution: 'КТЛ', city: 'Актобе', blocked: true, createdAt: day('2026-08-19') })
  await mkUser('sabina@mail.kz', 'Сабина Нурланова', 'user', { institution: 'ЕНУ им. Гумилёва', city: 'Астана', createdAt: day('2026-09-01') })

  // ---------- institutions ----------
  const instId = new Map<string, string>()
  for (const level of ['school', 'university'] as const) {
    for (const name of institutions[level]) {
      const i = await prisma.institution.create({ data: { name, level } })
      instId.set(name, i.id)
    }
  }

  await prisma.testimonial.createMany({
    data: [
      { order: 1, name: 'Гульнара Сейтова', role: 'Учитель, тренер дебатного клуба, Караганда', text: 'Раньше жеребьёвку мы делали в Excel до двух ночи. Теперь это одна кнопка, а результаты дети видят сразу на телефоне.' },
      { order: 2, name: 'Арсен Нурбеков', role: 'Ученик 10 класса, НИШ Астана', text: 'Удобно, что всё в одном месте: темы, комнаты, судьи и мои баллы. И на казахском, и на русском.' },
      { order: 3, name: 'Мария Ли', role: 'Судья, КазНУ Debate Society', text: 'Бюллетень заполняю прямо с телефона за пару минут. Система сама проверяет, чтобы победитель совпадал с баллами.' },
    ],
  })

  const judgeLinks: Record<string, number> = { t4: 0, t5: 1, t7: 0 } // judge@ account sits in these tournaments
  let judgeUserId: string | null = null
  let studentSpeakerId: string | null = null

  for (const [ti, t] of tournaments.entries()) {
    console.log(`Tournament ${t.key}: ${t.name}`)
    const offset = (ti + 1) * 3
    const pro = t.maxTeams > 12
    const tour = await prisma.tournament.create({
      data: {
        name: t.name, city: t.city, startDate: day(t.startDate), endDate: day(t.endDate), level: t.level, status: t.status,
        maxTeams: t.maxTeams, coverUrl: t.cover, organizerName: t.organizer, description: t.description,
        preliminaryRounds: t.prelims, breakSize: t.breakSize, languages: t.languages,
        plan: pro ? 'pro' : 'free', paid: !pro || t.status !== 'registration',
        moderation: t.moderation ?? 'approved',
        scoringConfig: { create: {} },
        schedule: { create: schedule.map(([d, time, title]) => ({ day: d, time, title })) },
        ...(t.owner && { organizers: { create: { userId: t.owner === 'org' ? org.id : dinara.id, role: 'owner' } } }),
      },
    })

    // teams + speakers
    const list = institutions[t.level]
    const teams = []
    for (let i = 0; i < t.teamsCount; i++) {
      const inst = list[(i + offset) % list.length]
      const team = await prisma.team.create({
        data: {
          tournamentId: tour.id, name: teamNames[(i + offset) % teamNames.length], institutionId: instId.get(inst),
          city: i % 3 === 0 ? t.city : cities[(i + offset) % cities.length],
          speakers: { create: [0, 1, 2].map(k => ({ name: person(i * 3 + k + offset), position: k + 1 })) },
        },
        include: { speakers: { orderBy: { position: 'asc' } } },
      })
      teams.push({ ...team, strength: 70 + rand() * 6 })
    }

    // judges
    const nJudges = Math.max(4, Math.ceil(t.teamsCount / 2) + 2)
    const judges: { id: string }[] = []
    for (let i = 0; i < nJudges; i++) {
      let name = person(i * 5 + 11)
      let userId: string | undefined
      if (judgeLinks[t.key] === i) {
        if (!judgeUserId) {
          const u = await mkUser('judge@debate.kz', name, 'user', { phone: '+7 702 222 33 44', institution: 'Nazarbayev University', city: 'Астана', createdAt: day('2026-03-15') })
          judgeUserId = u.id
        }
        const u = await prisma.user.findUniqueOrThrow({ where: { id: judgeUserId } })
        name = u.name
        userId = u.id
      }
      judges.push(await prisma.judge.create({
        data: { tournamentId: tour.id, name, rating: 9 - (i % 5), institutionId: instId.get(institutions.university[(i * 2) % institutions.university.length]), userId },
      }))
    }

    // rounds: finished -> all completed; ongoing -> 2 completed + 1 released; registration -> drafts
    const done = t.status === 'finished' ? t.prelims : t.status === 'ongoing' ? 2 : 0
    const nRooms = Math.floor(teams.length / 2)
    for (let r = 1; r <= t.prelims; r++) {
      const status = r <= done ? 'completed' : r === done + 1 && t.status === 'ongoing' ? 'released' : 'draft'
      const round = await prisma.round.create({
        data: {
          tournamentId: tour.id, number: r, name: `Раунд ${r}`, motion: motions[(r + ti + 1) % motions.length], status,
          date: day(r <= Math.ceil(t.prelims / 2) ? t.startDate : t.endDate),
        },
      })
      if (status === 'draft') continue

      // pair teams (shuffled deterministically per round)
      const order = teams.map((_, i) => i).sort((a, b) => ((a * (r + 2)) % 7) - ((b * (r + 2)) % 7) || a - b)
      for (let d = 0; d < nRooms; d++) {
        const prop = teams[order[d * 2]], opp = teams[order[d * 2 + 1]]
        // panel: one room per judge per round; chairs first, spares are wings; pool rotates each round
        const at = (i: number) => judges[(i + r * 3) % judges.length]
        const panel = [{ judge: at(d), isChair: true }]
        for (const w of [nRooms + d * 2, nRooms + d * 2 + 1]) if (w < judges.length) panel.push({ judge: at(w), isChair: false })

        // in the live round a third of the rooms is still waiting for ballots
        const hasBallots = status === 'completed' || d % 3 !== 0
        const ballots = hasBallots ? panel.map(p => {
          const scores: { speakerId: string; side: Side; position: number; score: number }[] = []
          const totals = { proposition: 0, opposition: 0 }
          for (const [side, team] of [['proposition', prop], ['opposition', opp]] as const) {
            for (const s of team.speakers) {
              const v = clamp(half(team.strength + (rand() - 0.5) * 4), 60, 80)
              scores.push({ speakerId: s.id, side, position: s.position, score: v })
              totals[side] += v
            }
            const reply = clamp(half(team.strength / 2 + (rand() - 0.5) * 2), 30, 40)
            scores.push({ speakerId: team.speakers[rand() < 0.5 ? 0 : 1].id, side, position: 4, score: reply })
            totals[side] += reply
          }
          if (totals.proposition === totals.opposition) { scores[3].score += 0.5; totals.proposition += 0.5 } // no ties in WSDC
          const winner: Side = totals.proposition > totals.opposition ? 'proposition' : 'opposition'
          return { judgeId: p.judge.id, winner, scores }
        }) : []

        const propVotes = ballots.filter(b => b.winner === 'proposition').length
        const winner: Side | null = !ballots.length ? null
          : propVotes * 2 === ballots.length ? ballots[0].winner // chair breaks a split panel
            : propVotes * 2 > ballots.length ? 'proposition' : 'opposition'

        await prisma.debate.create({
          data: {
            roundId: round.id, room: rooms[d % rooms.length], propositionTeamId: prop.id, oppositionTeamId: opp.id, winner,
            ballotStatus: status === 'completed' ? 'confirmed' : ballots.length ? 'submitted' : 'pending',
            judges: { create: panel.map(p => ({ judgeId: p.judge.id, isChair: p.isChair })) },
            ballots: { create: ballots.map(b => ({ judgeId: b.judgeId, winner: b.winner, scores: { create: b.scores } })) },
          },
        })
      }
    }

    if (t.key === 't4') studentSpeakerId = teams[0].speakers[0].id
  }

  // ---------- participant account linked to a real speaker ----------
  const speaker = await prisma.speaker.findUniqueOrThrow({ where: { id: studentSpeakerId! }, include: { team: { include: { institution: true, speakers: { orderBy: { position: 'asc' } } } } } })
  const student = await mkUser('student@debate.kz', speaker.name, 'user', {
    phone: '+7 705 333 44 55', institution: speaker.team.institution?.name, city: 'Караганда', createdAt: day('2026-04-02'),
  })
  await prisma.speaker.update({ where: { id: speaker.id }, data: { userId: student.id } })
  const t1 = await prisma.tournament.findFirstOrThrow({ where: { name: tournaments[0].name } })
  await prisma.teamRegistration.createMany({
    data: [
      { tournamentId: speaker.team.tournamentId, userId: student.id, teamName: speaker.team.name, institution: speaker.team.institution?.name ?? '', speakers: speaker.team.speakers.map(s => s.name), contactPhone: '+7 705 333 44 55', status: 'confirmed', createdAt: day('2026-09-02') },
      { tournamentId: t1.id, userId: student.id, teamName: 'Логос-2', institution: speaker.team.institution?.name ?? '', speakers: speaker.team.speakers.map(s => s.name), contactPhone: '+7 705 333 44 55', status: 'pending', createdAt: day('2026-09-20') },
    ],
  })

  const counts = await Promise.all([prisma.user.count(), prisma.tournament.count(), prisma.team.count(), prisma.debate.count(), prisma.ballot.count(), prisma.speakerScore.count()])
  console.log(`Done: ${counts[0]} users, ${counts[1]} tournaments, ${counts[2]} teams, ${counts[3]} debates, ${counts[4]} ballots, ${counts[5]} speaker scores`)
  console.log(`Admin: ${admin.email} / demo1234`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
