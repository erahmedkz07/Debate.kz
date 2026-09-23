# Debate.kz — backend

REST API платформы дебатных турниров.

**Стек:** Node.js 24 · Express 5 · TypeScript · Prisma 7 (`@prisma/adapter-pg`) · PostgreSQL 16 · zod · bcrypt · JWT (httpOnly cookie)

## Первый запуск (Windows)

```powershell
cd backend
npm install
copy .env.example .env      # затем задайте пароль БД и JWT_SECRET (см. комментарии в файле)
```

Создать пользователя и базу PostgreSQL (один раз):

```powershell
# если знаете пароль суперпользователя postgres
powershell -ExecutionPolicy Bypass -File scripts\setup-db.ps1
# если НЕ знаете — из PowerShell "от имени администратора":
# временно открывает локальный вход, создаёт роль/базу и всегда возвращает настройки обратно
powershell -ExecutionPolicy Bypass -File scripts\setup-db-admin.ps1
```

Оба скрипта берут логин, пароль и имя базы из `.env` и отказываются работать с базой, которая принадлежит другой роли (например, от старой версии проекта).

Таблицы, демо-данные и запуск:

```bash
npx prisma migrate dev      # применяет миграции
npm run db:seed             # демо-данные (стирает всё; в production не запускается)
npm run dev                 # http://localhost:4000, перезапуск при изменениях
```

Фронтенд (`../frontend`, `npm run dev`) проксирует `/api` на этот сервер.

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | dev-сервер с автоперезапуском |
| `npm run build` / `npm start` | сборка в `dist/` и запуск production-версии |
| `npm run typecheck` | проверка типов |
| `npm run db:migrate` | новая миграция после изменения `prisma/schema.prisma` |
| `npm run db:seed` / `db:reset` | демо-данные / сброс базы |
| `npm run test:e2e` | сквозной сценарий API (39 проверок; **меняет dev-базу** — после него `npm run db:seed`) |

## Демо-аккаунты (только после сида)

Пароль `demo1234`: `student@debate.kz`, `org@debate.kz`, `judge@debate.kz`, `admin@debate.kz`.
`maxim@mail.kz` заблокирован — для проверки блокировки.

## API

Все пути начинаются с `/api`. Ошибки: `{ "error": "<code>", "details"?: ... }` — фронтенд переводит `code` в сообщение на RU/KZ.

| Метод и путь | Доступ | Описание |
|---|---|---|
| `GET /health` | все | сервер и БД живы |
| `POST /auth/register`, `/auth/login`, `/auth/logout`, `GET /auth/me` | все / вошедший | сессия в httpOnly-cookie `dkz_token`, лимит попыток |
| `GET /tournaments`, `/tournaments/:id`, `/tournaments/:id/standings` | все | список с фильтрами, детали (неопубликованные темы и жеребьёвки скрыты), таблица из бюллетеней |
| `GET /cities`, `/stats`, `/testimonials`, `/rating` | все | справочники, статистика, рейтинг сезона |
| `PATCH /me`, `GET /me/registrations`, `GET /me/debates` | вошедший | профиль, заявки, мои дебаты |
| `POST /tournaments/:id/registrations` | участник | заявка команды |
| `GET /judge/assignments` | судья, админ | назначения |
| `GET/POST /ballots/:debateId` | судья состава, организатор турнира, админ | бюллетень с проверкой правил WSDC |
| `GET /organizer/tournaments`, `POST /tournaments`, `PATCH/DELETE /tournaments/:id` | организатор, админ | свои турниры |
| `POST /tournaments/:id/teams`, `PATCH/DELETE /teams/:id`, `POST /tournaments/:id/judges` | организатор турнира | команды и судьи |
| `PATCH /rounds/:id`, `POST /rounds/:id/draw`, `PATCH /debates/:id` | организатор турнира | темы, публикация/завершение раунда, жеребьёвка, комнаты/стороны/председатель |
| `GET /tournaments/:id/registrations`, `PATCH /registrations/:id` | организатор турнира | подтверждение заявок (создаёт команду) |
| `GET /admin/stats`, `/admin/tournaments`, `/admin/users`, `PATCH /admin/tournaments/:id`, `PATCH /admin/users/:id` | админ | оплата Pro, видимость, роли, блокировка |

## Правила, которые проверяет сервер

- Спикеры 60–80, ответная речь 30–40, шаг 0,5; ничьих нет; победитель = команда с большей суммой.
- Ответную речь говорит только 1-й или 2-й спикер.
- Судьи голосуют каждый за себя, решает большинство; при равенстве голосов — председатель.
  Если бюллетень вносит организатор (бумажный бюллетень), он сразу фиксирует результат.
- Раунд публикуется только с темой и жеребьёвкой; завершается, когда у всех дебатов есть результат; после завершения бюллетени закрыты.
- Жеребьёвка: по силе (победы → баллы спикеров), без повторных встреч, с балансом сторон; один судья — одна комната за раунд; судья не судит свою школу.
- Организатор управляет только своими турнирами; заблокированный пользователь теряет доступ сразу.
