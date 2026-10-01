import { esc } from '../lib/telegram.js'

// Everything the bot says, in Russian and Kazakh. Values from the database are escaped here (parse_mode=HTML),
// so a team called "<Alpha>" cannot break a message. Notification texts mirror the site's notification centre.

export type Lang = 'ru' | 'kz'
export const LANGS: Lang[] = ['ru', 'kz']
export const asLang = (v: unknown): Lang => (v === 'kz' ? 'kz' : 'ru')
// Telegram's interface language: "kk" is Kazakh
export const fromTelegram = (code?: string): Lang => (code?.toLowerCase().startsWith('kk') ? 'kz' : 'ru')

type D = Record<string, unknown>
const s = (v: unknown) => esc(String(v ?? ''))
const b = (v: unknown) => `<b>${s(v)}</b>`
const q = (v: unknown) => `«${s(v)}»`

const ru = {
  sideName: {
    proposition: 'Правительство', opposition: 'Оппозиция', openingProposition: 'Открывающее правительство', openingOpposition: 'Открывающая оппозиция',
    closingProposition: 'Закрывающее правительство', closingOpposition: 'Закрывающая оппозиция',
  } as Record<string, string>,
  kindName: { judge: 'судья', co_organizer: 'соорганизатор' } as Record<string, string>,
  resultName: { win: 'победа', loss: 'поражение', place1: '1-е место', place2: '2-е место', place3: '3-е место', place4: '4-е место' } as Record<string, string>,
  safetyStatus: { open: 'новое', in_progress: 'в работе', resolved: 'решено' } as Record<string, string>,
  help: [
    '<b>Debate.kz</b> — уведомления о ваших турнирах.',
    '',
    'Пишу, когда выходит жеребьёвка (аудитория, сторона, тема), когда судье назначен дебат, когда решают по заявке, оплате или турниру, и о событиях клуба.',
    '',
    '/next — что у меня сейчас: аудитория, тема, бюллетени',
    '/tournaments — мои турниры',
    '/me — мой аккаунт',
    '/lang — язык: қазақша / русский',
    '/stop — выключить уведомления, /on — включить',
  ].join('\n'),
  linked: (name: string) => `✅ Готово, ${b(name)}! Telegram подключён к Debate.kz.`,
  alreadyLinked: (name: string) => `Вы уже подключены как ${b(name)}.`,
  linkFirst: (url: string) => `Этот чат ещё не подключён к Debate.kz. Откройте профиль на сайте и нажмите «Подключить Telegram»:\n${url}`,
  linkExpired: 'Ссылка устарела или уже использована. Нажмите «Подключить Telegram» на сайте ещё раз.',
  blocked: 'Аккаунт заблокирован.',
  otherAccount: (name: string) => `Этот Telegram уже подключён к аккаунту ${b(name)}. Сначала отключите его там в профиле.`,
  askPhone: 'Подтвердите номер телефона — это защищает турниры от фейковых аккаунтов. Нажмите кнопку ниже: Telegram передаст только ваш номер.',
  sharePhone: '📱 Поделиться номером',
  ownContact: 'Отправьте свой номер кнопкой ниже.',
  kzOnly: 'Поддерживаются номера Казахстана (+7 7xx).',
  phoneTaken: 'Этот номер уже подтверждён в другом аккаунте Debate.kz.',
  phoneOk: (p: string) => `✅ Номер ${s(p)} подтверждён.`,
  me: (name: string, phone: boolean, notify: boolean) => [
    b(name),
    `Телефон: ${phone ? '✅ подтверждён' : 'не подтверждён — нажмите «Поделиться номером»'}`,
    `Уведомления: ${notify ? 'включены' : 'выключены'}`,
    'Язык: русский',
  ].join('\n'),
  notifyOn: 'Уведомления включены.',
  notifyOff: 'Уведомления выключены. /on — включить снова.',
  turnOn: '🔔 Включить уведомления',
  turnOff: '🔕 Выключить уведомления',
  langPick: 'Выберите язык бота / Бот тілін таңдаңыз:',
  langSet: 'Готово: бот говорит по-русски. Язык сайта меняется там же, в шапке.',
  nothingNow: 'Сейчас у вас нет опубликованных дебатов и бюллетеней. Я напишу, как только выйдет жеребьёвка.',
  nextSpeaker: (t: D) => `📢 ${b(t.tournament)} · ${s(t.round)}\n🚪 Аудитория: ${b(t.room)}\nВы — ${b(ru.sideName[String(t.side)])} против ${q(t.opponent)}${t.motion ? `\nТема: ${q(t.motion)}` : ''}${t.online ? `\n🔗 Онлайн: ${s(t.online)}` : ''}`,
  nextJudge: (t: D) => `⚖️ ${b(t.tournament)} · ${s(t.round)}\nВы ${t.chair ? '<b>председатель</b>' : 'боковой судья'} в аудитории ${b(t.room)}\n${q(t.proposition)} vs ${q(t.opposition)}${t.motion ? `\nТема: ${q(t.motion)}` : ''}${t.online ? `\n🔗 Онлайн: ${s(t.online)}` : ''}${t.submitted ? '\n✅ Бюллетень сдан' : '\n⏳ Бюллетень ещё не сдан'}`,
  nextOrganizer: (t: D) => `🗂 ${b(t.tournament)}: новых заявок — ${s(t.count)}`,
  noTournaments: 'У вас пока нет активных турниров. Найти турнир: ',
  tournamentsHead: '<b>Мои турниры</b>',
  asRole: { organizer: 'организатор', judge: 'судья', speaker: 'участник' } as Record<string, string>,
  open: 'Открыть',
  unknown: 'Не понял команду. Вот что я умею:',
  commands: {
    next: 'Что у меня сейчас', tournaments: 'Мои турниры', me: 'Мой аккаунт', lang: 'Язык / Тіл',
    stop: 'Выключить уведомления', on: 'Включить уведомления', help: 'Что умеет бот',
  } as Record<string, string>,
  description: 'Debate.kz — дебатные турниры Казахстана. Бот присылает жеребьёвку (аудитория, сторона, тема), назначения судьям, решения по заявкам и оплатам. Подключается из профиля на сайте.',
  shortDescription: 'Уведомления Debate.kz: жеребьёвка, судейство, заявки.',
}

const kz: typeof ru = {
  sideName: {
    proposition: 'Үкімет', opposition: 'Оппозиция', openingProposition: 'Ашушы үкімет', openingOpposition: 'Ашушы оппозиция',
    closingProposition: 'Жабушы үкімет', closingOpposition: 'Жабушы оппозиция',
  },
  kindName: { judge: 'төреші', co_organizer: 'қосалқы ұйымдастырушы' },
  resultName: { win: 'жеңіс', loss: 'жеңіліс', place1: '1-орын', place2: '2-орын', place3: '3-орын', place4: '4-орын' },
  safetyStatus: { open: 'жаңа', in_progress: 'қаралуда', resolved: 'шешілді' },
  help: [
    '<b>Debate.kz</b> — турнирлеріңіз туралы хабарламалар.',
    '',
    'Жеребе шыққанда (аудитория, тарап, тақырып), төрешіге дебат тағайындалғанда, өтінім, төлем не турнир бойынша шешім шыққанда және клуб жаңалықтары туралы жазамын.',
    '',
    '/next — қазір менде не бар: аудитория, тақырып, бюллетеньдер',
    '/tournaments — менің турнирлерім',
    '/me — менің аккаунтым',
    '/lang — тіл: қазақша / русский',
    '/stop — хабарламаларды өшіру, /on — қосу',
  ].join('\n'),
  linked: name => `✅ Дайын, ${b(name)}! Telegram Debate.kz-ке қосылды.`,
  alreadyLinked: name => `Сіз ${b(name)} ретінде қосылып тұрсыз.`,
  linkFirst: url => `Бұл чат Debate.kz-ке әлі қосылмаған. Сайттағы профильді ашып, «Telegram қосу» батырмасын басыңыз:\n${url}`,
  linkExpired: 'Сілтеменің мерзімі өтті немесе ол қолданылған. Сайтта «Telegram қосу» батырмасын қайта басыңыз.',
  blocked: 'Аккаунт бұғатталған.',
  otherAccount: name => `Бұл Telegram ${b(name)} аккаунтына қосылған. Алдымен сол профильде ажыратыңыз.`,
  askPhone: 'Телефон нөміріңізді растаңыз — бұл турнирлерді жалған аккаунттардан қорғайды. Төмендегі батырманы басыңыз: Telegram тек нөміріңізді жібереді.',
  sharePhone: '📱 Нөмірмен бөлісу',
  ownContact: 'Өз нөміріңізді төмендегі батырмамен жіберіңіз.',
  kzOnly: 'Тек Қазақстан нөмірлері қабылданады (+7 7xx).',
  phoneTaken: 'Бұл нөмір Debate.kz-тің басқа аккаунтында расталған.',
  phoneOk: p => `✅ ${s(p)} нөмірі расталды.`,
  me: (name, phone, notify) => [
    b(name),
    `Телефон: ${phone ? '✅ расталған' : 'расталмаған — «Нөмірмен бөлісу» батырмасын басыңыз'}`,
    `Хабарламалар: ${notify ? 'қосулы' : 'өшірулі'}`,
    'Тіл: қазақша',
  ].join('\n'),
  notifyOn: 'Хабарламалар қосылды.',
  notifyOff: 'Хабарламалар өшірілді. /on — қайта қосу.',
  turnOn: '🔔 Хабарламаларды қосу',
  turnOff: '🔕 Хабарламаларды өшіру',
  langPick: ru.langPick,
  langSet: 'Дайын: бот қазақша сөйлейді. Сайт тілі сайттың жоғарғы жағында ауыстырылады.',
  nothingNow: 'Қазір сізде жарияланған дебат пен бюллетень жоқ. Жеребе шыққан бойда жазамын.',
  nextSpeaker: t => `📢 ${b(t.tournament)} · ${s(t.round)}\n🚪 Аудитория: ${b(t.room)}\nСіз — ${b(kz.sideName[String(t.side)])}, қарсылас ${q(t.opponent)}${t.motion ? `\nТақырып: ${q(t.motion)}` : ''}${t.online ? `\n🔗 Онлайн: ${s(t.online)}` : ''}`,
  nextJudge: t => `⚖️ ${b(t.tournament)} · ${s(t.round)}\n${b(t.room)} аудиториясында сіз ${t.chair ? '<b>төрағасыз</b>' : 'бүйірлік төрешісіз'}\n${q(t.proposition)} vs ${q(t.opposition)}${t.motion ? `\nТақырып: ${q(t.motion)}` : ''}${t.online ? `\n🔗 Онлайн: ${s(t.online)}` : ''}${t.submitted ? '\n✅ Бюллетень тапсырылды' : '\n⏳ Бюллетень әлі тапсырылмаған'}`,
  nextOrganizer: t => `🗂 ${b(t.tournament)}: жаңа өтінімдер — ${s(t.count)}`,
  noTournaments: 'Сізде әзірге белсенді турнир жоқ. Турнир табу: ',
  tournamentsHead: '<b>Менің турнирлерім</b>',
  asRole: { organizer: 'ұйымдастырушы', judge: 'төреші', speaker: 'қатысушы' },
  open: 'Ашу',
  unknown: 'Команданы түсінбедім. Мен мыналарды істей аламын:',
  commands: {
    next: 'Қазір менде не бар', tournaments: 'Менің турнирлерім', me: 'Менің аккаунтым', lang: 'Тіл / Язык',
    stop: 'Хабарламаларды өшіру', on: 'Хабарламаларды қосу', help: 'Бот не істей алады',
  },
  description: 'Debate.kz — Қазақстандағы дебат турнирлері. Бот жеребені (аудитория, тарап, тақырып), төрешілерге тағайындауларды, өтінімдер мен төлемдер бойынша шешімдерді жібереді. Сайттағы профильден қосылады.',
  shortDescription: 'Debate.kz хабарламалары: жеребе, төрешілік, өтінімдер.',
}

export const T: Record<Lang, typeof ru> = { ru, kz }

// ---------- notifications: the same types as the site's notification centre ----------
type Render = (d: D, l: typeof ru) => string
const N: Record<Lang, Record<string, Render>> = {
  ru: {
    'participant.registrationConfirmed': d => `✅ Заявка команды ${q(d.team)} на турнир ${b(d.tournament)} подтверждена. Удачи!`,
    'participant.registrationRejected': d => `❌ Заявка команды ${q(d.team)} на турнир ${b(d.tournament)} отклонена организатором.`,
    'participant.registrationWaitlisted': d => `⏳ Команда ${q(d.team)} в листе ожидания турнира ${b(d.tournament)}. Если место освободится, она поднимется сама — мы напишем.`,
    'participant.drawReleased': (d, l) => l.nextSpeaker(d),
    'participant.roundResult': (d, l) => `${d.result === 'win' || d.result === 'place1' ? '🏆' : '📊'} ${b(d.tournament)} · ${s(d.round)}: ${b(l.resultName[String(d.result)])}. Таблица — на странице турнира.`,
    'participant.teammateReply': d => `🤝 Отклик на ваше объявление «Поиск сокомандника»\n${b(d.name)}${d.institution ? `, ${s(d.institution)}` : ''}${d.city ? `, ${s(d.city)}` : ''}:\n${q(d.message)}`,
    'participant.safetyUpdate': (d, l) => `🛡 Статус вашего обращения о поведении: ${b(l.safetyStatus[String(d.status)] ?? d.status)}. Ответ — на сайте.`,
    'participant.inviteReceived': (d, l) => `✉️ ${b(d.name)} приглашает вас в турнир ${q(d.tournament)}: ${s(l.kindName[String(d.kind)])}.`,
    'participant.clubJoined': d => `👋 ${b(d.name)} вступил(а) в клуб ${q(d.club)}.`,
    'participant.clubRemoved': d => `${b(d.name)} удалил(а) вас из клуба ${q(d.club)}. Можно вступить в другой клуб.`,
    'participant.clubRequest': d => `🙋 ${b(d.name)} хочет вступить в клуб ${q(d.club)}. Ответьте в профиле → «Мой клуб».`,
    'participant.clubRequestAccepted': d => `✅ Клуб ${q(d.club)} принял вашу заявку.`,
    'participant.clubRequestDeclined': d => `Клуб ${q(d.club)} не принял заявку. Можно подать заявку в другой клуб.`,
    'judge.assigned': (d, l) => l.nextJudge(d),
    'judge.joined': d => `⚖️ Вы судья турнира ${b(d.tournament)}. Назначения придут сюда после жеребьёвки.`,
    'organizer.newRegistration': d => `📝 Новая заявка на ${b(d.tournament)}: команда ${q(d.team)}`,
    'organizer.memberJoined': (d, l) => `🤝 ${b(d.name)} принял(а) приглашение: ${s(l.kindName[String(d.kind)])} турнира ${q(d.tournament)}.`,
    'organizer.inviteDeclined': (d, l) => `${b(d.name)} отклонил(а) приглашение (${s(l.kindName[String(d.kind)])}) в турнир ${q(d.tournament)}.`,
    'organizer.approved': d => `✅ Турнир ${q(d.tournament)} одобрен и опубликован.`,
    'organizer.rejected': d => `❌ Турнир ${q(d.tournament)} отклонён. Причина: ${s(d.reason)}`,
    'organizer.deleted': d => `🗑 Турнир ${q(d.tournament)} удалён администратором. Причина: ${s(d.reason)}`,
    'organizer.paymentConfirmed': d => `✅ Оплата Pro подтверждена: ${q(d.tournament)}. Ограничение по числу команд снято.`,
    'organizer.paymentRejected': d => `❌ Оплата Pro не подтверждена: ${q(d.tournament)}.\nПричина: ${s(d.reason)}\nПрикрепите верный чек в настройках турнира и отправьте ещё раз.`,
    'participant.tournamentFinished': d => `🏁 Турнир ${b(d.tournament)} завершён. Команда ${q(d.team)} — ${b(`${s(d.place)} место из ${s(d.teams)}`)}${d.inBreak ? ', вышла в брейк' : ''}. Сертификат — в профиле.`,
    'judge.tournamentFinished': d => `🏁 Турнир ${b(d.tournament)} завершён. Спасибо за судейство! Сертификат судьи — в профиле.`,
    'organizer.tournamentFinished': d => `🏁 Турнир ${q(d.tournament)} завершён. Победитель — ${b(d.winner)} (команд: ${s(d.teams)}). Участники и судьи получили сертификаты.`,
    'admin.tournamentPending': d => `🆕 Турнир ждёт проверки${d.pro ? ' · Pro' : ''}: ${q(d.tournament)} (${s(d.city)}), владелец — ${s(d.owner)}.`,
    'admin.safetyReport': () => '🛡 Новое сообщение о поведении. Подробности — только на сайте.',
    'admin.clubPending': d => `🆕 Новый клуб ждёт проверки: ${q(d.club)} (${s(d.city)}), создал(а) ${s(d.owner)}.`,
    'admin.clubReported': d => `⚠️ Жалоба на клуб ${q(d.club)} (${s(d.city)}). Подробности — в админ-панели.`,
    'participant.clubApproved': d => `✅ Клуб ${q(d.club)} проверен: он в каталоге и может подавать заявки на турниры.`,
    'participant.clubRejected': d => `❌ Клуб ${q(d.club)} не прошёл проверку. Причина: ${s(d.reason)}\nИсправьте данные клуба — он снова уйдёт на проверку.`,
    'participant.clubDeleted': d => `🗑 Клуб ${q(d.club)} удалён администратором. Причина: ${s(d.reason)}`,
    'admin.paymentClaimed': d => `💳 Оплата Pro: ${q(d.tournament)}, ${s(Number(d.amount).toLocaleString('ru-RU'))} ₸, код ${b(d.reference)}. Чек приложен — проверьте поступление в Kaspi.`,
  },
  kz: {
    'participant.registrationConfirmed': d => `✅ ${q(d.team)} командасының ${b(d.tournament)} турниріне өтінімі расталды. Сәттілік!`,
    'participant.registrationRejected': d => `❌ ${q(d.team)} командасының ${b(d.tournament)} турниріне өтінімін ұйымдастырушы қабылдамады.`,
    'participant.registrationWaitlisted': d => `⏳ ${q(d.team)} командасы ${b(d.tournament)} турнирінің күту тізімінде. Орын босаса, ол өзі көтеріледі — біз жазамыз.`,
    'participant.drawReleased': (d, l) => l.nextSpeaker(d),
    'participant.roundResult': (d, l) => `${d.result === 'win' || d.result === 'place1' ? '🏆' : '📊'} ${b(d.tournament)} · ${s(d.round)}: ${b(l.resultName[String(d.result)])}. Кесте — турнир бетінде.`,
    'participant.teammateReply': d => `🤝 «Сокомандник іздеу» хабарландыруыңызға жауап\n${b(d.name)}${d.institution ? `, ${s(d.institution)}` : ''}${d.city ? `, ${s(d.city)}` : ''}:\n${q(d.message)}`,
    'participant.safetyUpdate': (d, l) => `🛡 Мінез-құлық туралы өтінішіңіздің мәртебесі: ${b(l.safetyStatus[String(d.status)] ?? d.status)}. Жауабы — сайтта.`,
    'participant.inviteReceived': (d, l) => `✉️ ${b(d.name)} сізді ${q(d.tournament)} турниріне шақырады: ${s(l.kindName[String(d.kind)])}.`,
    'participant.clubJoined': d => `👋 ${b(d.name)} ${q(d.club)} клубына кірді.`,
    'participant.clubRemoved': d => `${b(d.name)} сізді ${q(d.club)} клубынан шығарды. Басқа клубқа кіруге болады.`,
    'participant.clubRequest': d => `🙋 ${b(d.name)} ${q(d.club)} клубына кіргісі келеді. Профиль → «Менің клубым» бөлімінде жауап беріңіз.`,
    'participant.clubRequestAccepted': d => `✅ ${q(d.club)} клубы өтініміңізді қабылдады.`,
    'participant.clubRequestDeclined': d => `${q(d.club)} клубы өтінімді қабылдамады. Басқа клубқа өтінім беруге болады.`,
    'judge.assigned': (d, l) => l.nextJudge(d),
    'judge.joined': d => `⚖️ Сіз ${b(d.tournament)} турнирінің төрешісісіз. Тағайындаулар жеребеден кейін осында келеді.`,
    'organizer.newRegistration': d => `📝 ${b(d.tournament)} турниріне жаңа өтінім: ${q(d.team)} командасы`,
    'organizer.memberJoined': (d, l) => `🤝 ${b(d.name)} шақыруды қабылдады: ${q(d.tournament)} турнирінің ${s(l.kindName[String(d.kind)])}.`,
    'organizer.inviteDeclined': (d, l) => `${b(d.name)} ${q(d.tournament)} турниріне шақырудан (${s(l.kindName[String(d.kind)])}) бас тартты.`,
    'organizer.approved': d => `✅ ${q(d.tournament)} турнирі мақұлданып, жарияланды.`,
    'organizer.rejected': d => `❌ ${q(d.tournament)} турнирі қабылданбады. Себебі: ${s(d.reason)}`,
    'organizer.deleted': d => `🗑 ${q(d.tournament)} турнирін әкімші жойды. Себебі: ${s(d.reason)}`,
    'organizer.paymentConfirmed': d => `✅ Pro төлемі расталды: ${q(d.tournament)}. Команда санына шектеу алынды.`,
    'organizer.paymentRejected': d => `❌ Pro төлемі расталмады: ${q(d.tournament)}.\nСебебі: ${s(d.reason)}\nТурнир баптауларында дұрыс чекті тіркеп, қайта жіберіңіз.`,
    'participant.tournamentFinished': d => `🏁 ${b(d.tournament)} турнирі аяқталды. ${q(d.team)} командасы — ${b(`${s(d.teams)} команданың ішінен ${s(d.place)}-орын`)}${d.inBreak ? ', брейкке шықты' : ''}. Сертификат — профильде.`,
    'judge.tournamentFinished': d => `🏁 ${b(d.tournament)} турнирі аяқталды. Төрешілік үшін рақмет! Төреші сертификаты — профильде.`,
    'organizer.tournamentFinished': d => `🏁 ${q(d.tournament)} турнирі аяқталды. Жеңімпаз — ${b(d.winner)} (командалар: ${s(d.teams)}). Қатысушылар мен төрешілер сертификат алды.`,
    'admin.tournamentPending': d => `🆕 Турнир тексеруді күтуде${d.pro ? ' · Pro' : ''}: ${q(d.tournament)} (${s(d.city)}), иесі — ${s(d.owner)}.`,
    'admin.safetyReport': () => '🛡 Мінез-құлық туралы жаңа өтініш. Толығырақ — тек сайтта.',
    'admin.clubPending': d => `🆕 Жаңа клуб тексеруді күтуде: ${q(d.club)} (${s(d.city)}), құрған — ${s(d.owner)}.`,
    'admin.clubReported': d => `⚠️ ${q(d.club)} клубына шағым (${s(d.city)}). Толығы — әкімші панелінде.`,
    'participant.clubApproved': d => `✅ ${q(d.club)} клубы тексерілді: ол каталогта және турнирлерге өтінім бере алады.`,
    'participant.clubRejected': d => `❌ ${q(d.club)} клубы тексеруден өтпеді. Себебі: ${s(d.reason)}\nКлуб деректерін түзетіңіз — ол қайта тексеруге кетеді.`,
    'participant.clubDeleted': d => `🗑 ${q(d.club)} клубын әкімші жойды. Себебі: ${s(d.reason)}`,
    'admin.paymentClaimed': d => `💳 Pro төлемі: ${q(d.tournament)}, ${s(Number(d.amount).toLocaleString('ru-RU'))} ₸, коды ${b(d.reference)}. Чек тіркелген — Kaspi-дағы түсімді тексеріңіз.`,
  },
}

// the button under a notification: where the link leads
const BUTTON: Record<Lang, Record<string, string>> = {
  ru: {
    participant: 'Открыть на сайте', 'participant.drawReleased': 'Жеребьёвка', 'participant.inviteReceived': 'Принять или отклонить',
    'participant.clubRequest': 'Ответить', 'judge.assigned': 'Заполнить бюллетень', 'organizer.newRegistration': 'Заявки',
    organizer: 'Управление турниром', 'admin.paymentClaimed': 'Открыть оплаты', 'admin.safetyReport': 'Открыть обращения', admin: 'Админ-панель',
    judge: 'Кабинет судьи', 'participant.tournamentFinished': 'Мои сертификаты', 'judge.tournamentFinished': 'Мои сертификаты',
    'organizer.tournamentFinished': 'Итоги турнира',
  },
  kz: {
    participant: 'Сайтта ашу', 'participant.drawReleased': 'Жеребе', 'participant.inviteReceived': 'Қабылдау не бас тарту',
    'participant.clubRequest': 'Жауап беру', 'judge.assigned': 'Бюллетеньді толтыру', 'organizer.newRegistration': 'Өтінімдер',
    organizer: 'Турнирді басқару', 'admin.paymentClaimed': 'Төлемдерді ашу', 'admin.safetyReport': 'Өтініштерді ашу', admin: 'Әкімші панелі',
    judge: 'Төреші кабинеті', 'participant.tournamentFinished': 'Менің сертификаттарым', 'judge.tournamentFinished': 'Менің сертификаттарым',
    'organizer.tournamentFinished': 'Турнир қорытындысы',
  },
}

export function renderNotification(type: string, data: D, lang: Lang): string | null {
  const fn = N[lang][type]
  return fn ? fn(data, T[lang]) : null
}
export const buttonLabel = (type: string, lang: Lang) => BUTTON[lang][type] ?? BUTTON[lang][type.split('.')[0]] ?? T[lang].open
