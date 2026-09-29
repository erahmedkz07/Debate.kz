# Выкладка Debate.kz на сервер

Инструкция для одного сервера: сайт и API на одном домене, nginx раздаёт интерфейс и передаёт `/api` в Node.
Все команды — на сервере Ubuntu 24.04 по SSH.

## 0. Что нужно купить и подготовить (делаете вы)

| Что | Зачем | Где |
|---|---|---|
| VPS в Казахстане: 2 vCPU, 2–4 ГБ памяти, 40 ГБ диска, Ubuntu 24.04 | Закон РК «О персональных данных и их защите» требует хранить базу с данными граждан РК на территории Казахстана | PS Cloud, Hoster.kz, QazCloud и т. п. |
| Домен (например, `debate.kz`) | Адрес сайта, HTTPS, почта | Регистраторы зоны .kz (нужен владелец-резидент) |
| Почта на домене (`no-reply@домен`) | Письма подтверждения не попадают в спам; у Gmail лимит ~500 писем в день | Любой почтовый сервис для бизнеса с SMTP |
| Отдельный Telegram-бот для боевого сайта | Один токен может опрашивать только один процесс: dev и prod не должны делить бота | @BotFather → `/newbot` |
| ИП (или ТОО) | Официальный приём оплаты Pro по Kaspi | Ваш бизнес-аккаунт Kaspi |

## 1. DNS

У регистратора домена: запись `A` для `@` и `www` → IP сервера. Подождите, пока `ping домен` не покажет этот IP.

## 2. Сервер

```bash
sudo apt-get update && sudo apt-get -y install git
sudo git clone https://github.com/erahmedkz07/Debate.kz.git /opt/debatekz
sudo bash /opt/debatekz/deploy/setup-server.sh
sudo chown -R debatekz:debatekz /opt/debatekz
```

`setup-server.sh` ставит Node 24, PostgreSQL, nginx, certbot, firewall (только SSH и веб), fail2ban, автообновления безопасности,
создаёт пользователя `debatekz` и каталоги:

- `/opt/debatekz` — код;
- `/var/lib/debatekz` — загруженные файлы и чеки (`STORAGE_DIR`);
- `/var/backups/debatekz` — резервные копии;
- `/etc/debatekz/api.env` — секреты.

## 3. Настройки и база

```bash
sudo cp /opt/debatekz/deploy/api.env.example /etc/debatekz/api.env
sudo bash /opt/debatekz/deploy/create-db.sh      # создаёт базу и сам пишет DATABASE_URL
sudo nano /etc/debatekz/api.env                   # JWT_SECRET, CLIENT_ORIGIN, SMTP_*, TELEGRAM_*, GOOGLE_*, ALERT_CHAT_ID
```

API не запустится в production, если адрес не `https://`, нет почты, `JWT_SECRET` короче 48 символов или `STORAGE_DIR`
не абсолютный путь. Причина будет написана в `journalctl -u debatekz-api`.

База создаётся пустой: демо-аккаунтов на боевом сайте нет (сид в production запрещён).

## 4. Первая выкладка

```bash
sudo cp /opt/debatekz/deploy/debatekz-api.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable debatekz-api
sudo -iu debatekz bash /opt/debatekz/deploy/deploy.sh
```

`deploy.sh`: код из `main` → сборка API и сайта → резервная копия → миграции → перезапуск → проверка `/api/health`.

## 5. nginx и HTTPS

```bash
sudo cp /opt/debatekz/deploy/nginx/debatekz.conf /etc/nginx/sites-available/debatekz
sudo sed -i 's/debate.kz/ВАШ_ДОМЕН/g' /etc/nginx/sites-available/debatekz   # если домен другой
sudo ln -s /etc/nginx/sites-available/debatekz /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ВАШ_ДОМЕН -d www.ВАШ_ДОМЕН
```

Certbot сам добавит HTTPS, перенаправление с http и продление сертификата.

## 6. Резервные копии и мониторинг

```bash
sudo cp /opt/debatekz/deploy/cron /etc/cron.d/debatekz
```

- каждую ночь в 03:30 — копия базы и файлов, хранится 14 дней (`/var/backups/debatekz`);
- каждые 5 минут — проверка сайта; если он упал или поднялся, бот пишет в `ALERT_CHAT_ID`
  (узнать id чата: написать боту и открыть `https://api.telegram.org/bot<токен>/getUpdates`).

Копия на том же сервере не спасёт при потере сервера. Настройте копию вне сервера: `rclone` (строка в `backup.sh`).

**Проверьте восстановление до запуска** (на тестовой базе или сразу после установки):

```bash
sudo -iu debatekz bash /opt/debatekz/deploy/restore.sh /var/backups/debatekz/db-<дата>.dump /var/backups/debatekz/files-<дата>.tar.gz
```

## 7. Внешние сервисы

- **Google-вход:** Google Cloud Console → OAuth client → Authorized redirect URIs: `https://ВАШ_ДОМЕН/api/auth/google/callback`.
  Экран согласия переведите из «Testing» в «In production», иначе войдут только тестовые пользователи.
- **Почта:** у почтового сервиса добавьте в DNS записи SPF, DKIM и DMARC. Проверка: отправьте письмо на mail-tester.com, оценка должна быть 9/10 или выше.
- **Telegram:** токен боевого бота — только в `/etc/debatekz/api.env`; в локальном `.env` для разработки — другой бот.

## 8. Первый администратор

Зарегистрируйтесь на сайте обычным способом, затем:

```bash
sudo -iu debatekz bash -c 'cd /opt/debatekz/backend && set -a && source /etc/debatekz/api.env && set +a && npx tsx scripts/make-admin.ts ВАШ_EMAIL'
```

## 9. Обновления

Каждое обновление после мержа в `main`:

```bash
sudo -iu debatekz bash /opt/debatekz/deploy/deploy.sh
```

Если проверка после перезапуска не прошла, скрипт завершится с ошибкой. Смотрите `journalctl -u debatekz-api -n 100`.
Откат: `git -C /opt/debatekz reset --hard <прошлый коммит>` и снова `deploy.sh` с `BRANCH`, или `restore.sh`, если мешает миграция.

## 10. Чек-лист перед открытием

- [ ] `https://домен` открывается, http перенаправляет на https
- [ ] обновление страницы на `/tournaments/...` не даёт 404
- [ ] регистрация → письмо пришло во «Входящие», не в спам
- [ ] вход через Google с аккаунта, который не является тестовым
- [ ] загрузка аватара и логотипа, после `deploy.sh` картинки на месте
- [ ] бот отвечает на `/start`, привязка аккаунта работает
- [ ] ночная копия появилась в `/var/backups/debatekz`, восстановление проверено
- [ ] остановили API (`sudo systemctl stop debatekz-api`) — через 5 минут пришло сообщение о падении
- [ ] опубликованы политика конфиденциальности и пользовательское соглашение
