# Creates the application role and database for Debate.kz in the local PostgreSQL 16.
# Run once:  powershell -ExecutionPolicy Bypass -File backend\scripts\setup-db.ps1
# psql asks for the password of the "postgres" superuser (the one set during PostgreSQL install).
# The app password is read from backend\.env, so no secret lives in this script.

$ErrorActionPreference = 'Stop'

$psql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
if (-not (Test-Path $psql)) { throw "psql not found at $psql" }

# Parse DATABASE_URL from .env -> user, password, database
$envFile = Join-Path $PSScriptRoot '..\.env'
if (-not (Test-Path $envFile)) { throw ".env not found: $envFile" }
$line = Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if ($line -notmatch 'postgresql://([^:]+):([^@]+)@[^/]+/([^?"]+)') { throw 'DATABASE_URL has unexpected format' }
$appUser = $Matches[1]; $appPass = $Matches[2]; $appDb = $Matches[3]

Write-Host "Creating role '$appUser' and database '$appDb'..." -ForegroundColor Cyan

# Idempotent: re-running updates the password instead of failing.
# CREATEDB is needed by "prisma migrate dev" for its temporary shadow database.
$sql = @"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$appUser') THEN
    CREATE ROLE $appUser LOGIN CREATEDB PASSWORD '$appPass';
  ELSE
    ALTER ROLE $appUser WITH LOGIN CREATEDB PASSWORD '$appPass';
  END IF;
END
`$`$;
-- refuse to reuse a database that belongs to another role (e.g. an older project)
DO `$`$
BEGIN
  IF EXISTS (SELECT FROM pg_database WHERE datname = '$appDb' AND pg_get_userbyid(datdba) <> '$appUser') THEN
    RAISE EXCEPTION 'Database "$appDb" already exists and belongs to another role. Pick another name in backend/.env';
  END IF;
END
`$`$;
SELECT 'CREATE DATABASE $appDb OWNER $appUser ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$appDb')\gexec
"@

$sql | & $psql -U postgres -h localhost -d postgres -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw "psql failed with exit code $LASTEXITCODE" }

Write-Host "Done. Role '$appUser' and database '$appDb' are ready." -ForegroundColor Green
