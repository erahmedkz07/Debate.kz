#!/usr/bin/env bash
# Nightly backup: the database (pg_dump custom format) and the uploaded files.
# Keeps KEEP_DAYS days. Runs from cron as debatekz (deploy/cron) and before every deploy.
set -euo pipefail

ENV_FILE=/etc/debatekz/api.env
BACKUP_DIR=${BACKUP_DIR:-/var/backups/debatekz}
DATA_DIR=/var/lib/debatekz
KEEP_DAYS=${KEEP_DAYS:-14}
STAMP=$(date +%Y-%m-%d_%H%M)

set -a; source "$ENV_FILE"; set +a
mkdir -p "$BACKUP_DIR"

# pg_dump does not understand the ?schema= suffix Prisma uses
DB_URL=${DATABASE_URL%%\?*}
pg_dump -Fc -f "$BACKUP_DIR/db-$STAMP.dump" "$DB_URL"
tar -czf "$BACKUP_DIR/files-$STAMP.tar.gz" -C "$DATA_DIR" uploads private

# an empty dump is a failed dump
[[ -s "$BACKUP_DIR/db-$STAMP.dump" ]] || { echo "empty dump"; exit 1; }

find "$BACKUP_DIR" -name 'db-*.dump' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'files-*.tar.gz' -mtime +"$KEEP_DAYS" -delete

# off-server copy (recommended): uncomment after `rclone config` with any S3-compatible storage
# rclone copy "$BACKUP_DIR" remote:debatekz-backups --max-age 25h

echo "backup $STAMP: $(du -h "$BACKUP_DIR/db-$STAMP.dump" | cut -f1) db, $(du -h "$BACKUP_DIR/files-$STAMP.tar.gz" | cut -f1) files"
