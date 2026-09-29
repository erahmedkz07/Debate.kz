#!/usr/bin/env bash
# Deploys the current main branch: build, back up, migrate, restart, check.
# Run as the app user: sudo -iu debatekz bash /opt/debatekz/deploy/deploy.sh
set -euo pipefail

APP_DIR=/opt/debatekz
ENV_FILE=/etc/debatekz/api.env
BRANCH=${BRANCH:-main}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:4000/api/health}

[[ $(id -un) == debatekz ]] || { echo "run as debatekz: sudo -iu debatekz bash $0"; exit 1; }
cd "$APP_DIR"

echo "== code"
git fetch --prune origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
echo "deploying $(git log --oneline -1)"

echo "== backend build"
cd backend
npm ci --no-audit --no-fund
npm run build

echo "== frontend build"
cd ../frontend
npm ci --no-audit --no-fund
npm run build

echo "== backup before migrations"
bash "$APP_DIR/deploy/backup.sh"

echo "== migrations"
cd ../backend
# prisma reads DATABASE_URL from the environment
set -a; source "$ENV_FILE"; set +a
npx prisma migrate deploy

echo "== restart"
sudo /usr/bin/systemctl restart debatekz-api

# the API needs a few seconds for the DB pool
for i in $(seq 1 20); do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    echo "OK: $(git log --oneline -1) is live"
    exit 0
  fi
  sleep 1
done
echo "FAILED: health check did not pass; see: journalctl -u debatekz-api -n 100"
exit 1
