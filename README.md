<p align="center">
  <img src="brand/debate-logo-square.svg" width="96" alt="Debate.kz logo" />
</p>

<h1 align="center">Debate.kz</h1>

<p align="center">Платформа для организации и проведения дебатных турниров в Казахстане — школьных и университетских.</p>

## О проекте

В городах Казахстана нет удобного местного сервиса для турниров: жеребьёвку делают вручную в Excel,
а за сомнительные сайты платят посредникам. Debate.kz закрывает весь цикл турнира:
регистрация команд → жеребьёвка → распределение судей → онлайн-бюллетени → результаты и рейтинг.

- Формат MVP: **World Schools Debate (WSDC)**
- Интерфейс: **қазақша** и **русский**
- Тарифы: бесплатно до 12 команд, от 13 команд — платно (оплата вне системы)

## Структура репозитория

| Папка | Что внутри | Статус |
|---|---|---|
| [`frontend/`](frontend/) | React + Vite + TypeScript + Tailwind, работает через API | ✅ |
| [`brand/`](brand/) | SVG-логотип (орнамент «қошқар мүйіз»), favicon | ✅ |
| [`backend/`](backend/) | Express + TypeScript + PostgreSQL 16 + Prisma 7 — API, авторизация, правила WSDC | ✅ API |
| Telegram-бот | Уведомления о раундах и результатах | ⏳ в планах |

## Быстрый старт

```bash
# 1. backend (PostgreSQL 16 должен быть установлен) — подробно в backend/README.md
cd backend && npm install && npx prisma migrate dev && npm run db:seed && npm run dev
# 2. frontend (в другом терминале)
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Подробности — в [frontend/README.md](frontend/README.md).

## Автор

**Ермек Ахмед** — Full-Stack разработчик и DevOps-инженер · [@erahmedkz07](https://github.com/erahmedkz07)
