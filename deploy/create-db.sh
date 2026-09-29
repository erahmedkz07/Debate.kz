#!/usr/bin/env bash
# Creates the production database and its owner with a random password,
# then writes DATABASE_URL into /etc/debatekz/api.env (never printed).
# Run as root: sudo bash deploy/create-db.sh
set -euo pipefail

DB_NAME=debatekz
DB_USER=debatekz_app
ENV_FILE=/etc/debatekz/api.env

[[ $EUID -eq 0 ]] || { echo "run as root (sudo)"; exit 1; }
[[ -f $ENV_FILE ]] || { echo "copy deploy/api.env.example to $ENV_FILE first"; exit 1; }

if sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='$DB_USER'" | grep -q 1; then
  echo "role $DB_USER already exists, nothing to do"
  exit 0
fi

# url-safe password: no quoting problems in the connection string
PASS=$(openssl rand -base64 36 | tr -d '/+=' | cut -c1-40)
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE $DB_USER LOGIN PASSWORD '$PASS';
CREATE DATABASE $DB_NAME OWNER $DB_USER ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE $DB_NAME FROM PUBLIC;
SQL

URL="postgresql://$DB_USER:$PASS@localhost:5432/$DB_NAME?schema=public"
if grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"$URL\"|" "$ENV_FILE"
else
  echo "DATABASE_URL=\"$URL\"" >> "$ENV_FILE"
fi
chown root:debatekz "$ENV_FILE"
chmod 640 "$ENV_FILE"
echo "database $DB_NAME created; DATABASE_URL saved to $ENV_FILE"
