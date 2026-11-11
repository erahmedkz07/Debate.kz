// Replaces every news post with the three launch posts (the owner's decision of 2026-11-11).
// Run: node scripts/launch-news.mjs --yes   (DATABASE_URL from .env; take a backup first: npm run backup)
// Without --yes it only shows what it would do. On the production server it is run once, after the first admin exists.
import pg from 'pg'
import './load-env.mjs'

const POSTS = [
  {
    title: 'Debaters.kz запускается: дебатные турниры Казахстана в одном месте',
    summary: 'Регистрация команд, жеребьёвка, судьи, бюллетени и результаты — теперь на одной платформе, на казахском и русском.',
    cover: 'https://images.unsplash.com/photo-1715610237622-748477adf2e4?auto=format&fit=crop&w=1200&q=75',
    body: `Debaters.kz — казахстанская платформа для дебатных турниров. Мы сделали её, чтобы организаторы больше не сидели ночами над Excel, а участники и судьи видели всё нужное на телефоне.

## Что умеет платформа
- **Организаторам:** турнир создаётся за пять минут — формат, раунды, лиги, брейк. Жеребьёвка учитывает клубы и стороны, судьи распределяются без конфликтов интересов.
- **Судьям:** бюллетень заполняется с телефона и проверяется сам — победитель всегда совпадает с баллами. Работает даже без интернета.
- **Участникам:** заявка команды, отметка на месте по коду, жеребьёвка, таблица и сертификат — всё на странице турнира.

## Восемь форматов
WSDC, АПФ, Карл Поппер, британский парламентский, Линкольн — Дуглас, Public Forum, азиатский парламентский и Australs. Для каждого есть таймер речей и калькулятор баллов.

## Сколько стоит
Турнир до 20 команд — бесплатно. Для больших турниров есть тариф Pro с оплатой через Kaspi.

Начните с профиля: укажите свой клуб и команду — это нужно для заявок на турниры.`,
    at: '2026-11-11T07:00:00Z',
  },
  {
    title: 'Telegram-бот: турниры прямо в мессенджере',
    summary: 'Регистрация, поиск турниров, заявка команды, отметка на месте, жеребьёвка и результаты — без сайта, в одном чате.',
    cover: 'https://images.unsplash.com/photo-1758270704763-22072a90d3b6?auto=format&fit=crop&w=1200&q=75',
    body: `У Debaters.kz есть Telegram-бот. Он говорит на казахском и русском и умеет почти всё, что умеет сайт.

## Что можно сделать в боте
- зарегистрироваться за минуту: имя, телефон одной кнопкой и почта;
- найти турнир и подать заявку команды;
- отметиться на месте турнира по коду с экрана;
- посмотреть свою аудиторию, сторону и тему, как только выйдет жеребьёвка;
- открыть таблицу турнира и свои результаты.

Всё главное — в меню под полем ввода, команды запоминать не нужно.

## Уведомления
Бот напишет, когда вашу заявку примут, накануне турнира, когда опубликуют жеребьёвку и когда будут готовы итоги. Судья получает назначение и ссылку на бюллетень, организатор — новые заявки с кнопками «Принять» и «Отклонить».

## Вход на сайт без пароля
На странице входа нажмите «Войти через Telegram» и подтвердите вход в боте одним касанием.`,
    at: '2026-11-11T06:00:00Z',
  },
  {
    title: 'Турнирге қалай қатысуға болады: үш қадам',
    summary: 'Клуб, команда және өтінім — Debaters.kz-те алғашқы турниріңізге осылай дайындаласыз.',
    cover: 'https://images.unsplash.com/photo-1544531586-fde5298cdd40?auto=format&fit=crop&w=1200&q=75',
    body: `Debaters.kz-те турнирге өтінімді клуб командалары береді. Бұл ұйымдастырушыларға кім қайдан келгенін білуге, ал жеребеге бір клубтың командаларын алғашқы раундтарда кездестірмеуге көмектеседі.

## 1. Клубқа кіріңіз
Клуб жетекшісінен клуб кодын сұраңыз да, профильдегі «Менің клубым» бөліміне енгізіңіз. Клубыңыз әлі жоқ болса, оны өзіңіз құрыңыз — әкімші тексерген соң ол каталогта шығады.

## 2. Команда таңдаңыз
Клуб ішінде команданы таңдаңыз немесе жаңасын құрыңыз. Клубтың барлық мүшесі тең: әркім команда құрып, құрамды бөле алады.

## 3. Өтінім беріңіз
Турнир бетіндегі «Өтінім беру» батырмасын басыңыз немесе Telegram-боттағы «📝 Өтінім беру» мәзірін пайдаланыңыз. Шешім шыққанда хабарлама келеді.

Турнир күні орнында белгіленуді ұмытпаңыз: экрандағы кодты сайтқа немесе ботқа енгізсеңіз болғаны. Сәттілік!`,
    at: '2026-11-11T05:00:00Z',
  },
]

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
const now = (await db.query('select count(*)::int as n from news')).rows[0].n
const admin = (await db.query("select id from users where role = 'admin' and not blocked order by created_at limit 1")).rows[0]
console.log(`news now: ${now}; new posts: ${POSTS.length}; author: ${admin ? 'the first admin' : 'none'}`)
if (!process.argv.includes('--yes')) {
  console.log('dry run: nothing changed (add --yes to replace the news)')
  await db.end()
  process.exit(0)
}
await db.query('begin')
try {
  await db.query('delete from news')
  for (const p of POSTS) {
    await db.query(
      `insert into news (id, title, summary, body, cover_url, published, published_at, author_id, created_at, updated_at)
       values ('n' || md5(random()::text || clock_timestamp()::text), $1, $2, $3, $4, true, $5, $6, $5, $5)`,
      [p.title, p.summary, p.body, p.cover, p.at, admin?.id ?? null],
    )
  }
  await db.query('commit')
  console.log(`done: ${now} removed, ${POSTS.length} published`)
} catch (e) {
  await db.query('rollback')
  throw e
} finally {
  await db.end()
}
