#!/usr/bin/env bash
# One-time server bootstrap for Debate.kz on Ubuntu 24.04.
# Run as root on a fresh VPS: sudo bash deploy/setup-server.sh
set -euo pipefail

APP_USER=debatekz
APP_DIR=/opt/debatekz            # code (git checkout)
DATA_DIR=/var/lib/debatekz       # uploads + private receipts (STORAGE_DIR)
BACKUP_DIR=/var/backups/debatekz
ETC_DIR=/etc/debatekz            # api.env with secrets
NODE_MAJOR=24

[[ $EUID -eq 0 ]] || { echo "run as root (sudo)"; exit 1; }

# Kazakhstan time for logs and cron; the app itself counts dates in Asia/Almaty anyway
timedatectl set-timezone Asia/Almaty

apt-get update
apt-get -y upgrade
apt-get -y install ca-certificates curl git nginx postgresql postgresql-contrib \
  certbot python3-certbot-nginx ufw fail2ban unattended-upgrades

# Node.js from NodeSource (the Ubuntu package is too old for Prisma 7)
if ! command -v node >/dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt $NODE_MAJOR ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get -y install nodejs
fi

# system user without a login shell password; owns the code and the data
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$APP_DIR"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$DATA_DIR" "$DATA_DIR/uploads" "$DATA_DIR/private"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$BACKUP_DIR"
install -d -o root -g "$APP_USER" -m 750 "$ETC_DIR"
# nginx serves uploads straight from disk: it may read (not write) them
chmod 755 "$DATA_DIR" "$DATA_DIR/uploads"

# firewall: SSH and web only; PostgreSQL stays on localhost
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

systemctl enable --now fail2ban unattended-upgrades nginx postgresql

# the API restarts itself without sudo rights for anything else
cat > /etc/sudoers.d/debatekz <<EOF
$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart debatekz-api, /usr/bin/systemctl stop debatekz-api, /usr/bin/systemctl status debatekz-api
EOF
chmod 440 /etc/sudoers.d/debatekz

echo
echo "Done. Next: deploy/README.md, step 3 (database)."
