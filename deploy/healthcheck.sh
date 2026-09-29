#!/usr/bin/env bash
# Uptime check every 5 minutes (cron). When the site goes down or comes back,
# one Telegram message goes to ALERT_CHAT_ID through the production bot. No spam while it stays down.
set -uo pipefail

ENV_FILE=/etc/debatekz/api.env
STATE=/var/lib/debatekz/.health-state
set -a; source "$ENV_FILE"; set +a
URL=${HEALTH_URL:-$CLIENT_ORIGIN/api/health}

if curl -fsS --max-time 10 "$URL" >/dev/null; then now=up; else now=down; fi
before=$(cat "$STATE" 2>/dev/null || echo up)
echo "$now" > "$STATE"
[[ $now == "$before" ]] && exit 0

# only on a change: down -> alert, up again -> all clear
text="Debate.kz: сайт НЕ отвечает ($URL). Проверьте: journalctl -u debatekz-api -n 100"
[[ $now == up ]] && text="Debate.kz: сайт снова работает"
if [[ -n ${TELEGRAM_BOT_TOKEN:-} && -n ${ALERT_CHAT_ID:-} ]]; then
  curl -fsS --max-time 10 "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
    --data-urlencode "chat_id=$ALERT_CHAT_ID" --data-urlencode "text=$text" >/dev/null
fi
logger -t debatekz-health "$text"
