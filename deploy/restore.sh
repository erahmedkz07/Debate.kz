#!/usr/bin/env bash
# Restores the database (and optionally the files) from a backup made by backup.sh.
# Usage (as debatekz): bash deploy/restore.sh /var/backups/debatekz/db-2026-11-10_0330.dump [files-....tar.gz]
# The API is stopped during the restore. Everything written after the backup is lost.
set -euo pipefail

DUMP=${1:?path to db-*.dump}
FILES=${2:-}
ENV_FILE=/etc/debatekz/api.env
DATA_DIR=/var/lib/debatekz

[[ -s $DUMP ]] || { echo "no such dump: $DUMP"; exit 1; }
read -r -p "Replace the LIVE database with $(basename "$DUMP")? Type RESTORE: " answer
[[ $answer == RESTORE ]] || { echo "cancelled"; exit 1; }

set -a; source "$ENV_FILE"; set +a
DB_URL=${DATABASE_URL%%\?*}

sudo /usr/bin/systemctl stop debatekz-api || true
# --clean drops the objects first; --no-owner keeps the app role as owner
pg_restore --clean --if-exists --no-owner -d "$DB_URL" "$DUMP"
if [[ -n $FILES ]]; then
  tar -xzf "$FILES" -C "$DATA_DIR"
fi
sudo /usr/bin/systemctl restart debatekz-api
echo "restored from $(basename "$DUMP")"
