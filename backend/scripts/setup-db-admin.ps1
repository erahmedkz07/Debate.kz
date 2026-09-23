# Use this when you don't know the "postgres" superuser password.
# Must run as Administrator (edits pg_hba.conf and restarts the PostgreSQL service).
#
# What it does:
#   1. backs up pg_hba.conf and TEMPORARILY allows password-less login for "postgres" from this machine only
#   2. creates the app role + database from backend\.env (same as setup-db.ps1)
#   3. optionally sets a NEW password for "postgres" (you type it; it is never stored anywhere)
#   4. ALWAYS restores the original pg_hba.conf and restarts the service, even if something fails
#
# Run:  powershell -ExecutionPolicy Bypass -File backend\scripts\setup-db-admin.ps1   (from an Administrator PowerShell)

$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script from PowerShell opened "as Administrator".'
}

$pgRoot  = 'C:\Program Files\PostgreSQL\16'
$psql    = Join-Path $pgRoot 'bin\psql.exe'
$hba     = Join-Path $pgRoot 'data\pg_hba.conf'
$service = 'postgresql-x64-16'
$backup  = "$hba.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$newPass = $null

# --- read app credentials from .env ---
$envFile = Join-Path $PSScriptRoot '..\.env'
$line = Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if ($line -notmatch 'postgresql://([^:]+):([^@]+)@[^/]+/([^?"]+)') { throw 'DATABASE_URL has unexpected format' }
$appUser = $Matches[1]; $appPass = $Matches[2]; $appDb = $Matches[3]

function Restart-Pg {
    Restart-Service -Name $service -Force
    # wait until the server accepts connections again
    for ($i = 0; $i -lt 30; $i++) {
        & (Join-Path $pgRoot 'bin\pg_isready.exe') -h localhost -p 5432 | Out-Null
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Seconds 1
    }
    throw 'PostgreSQL did not come back after restart'
}

Copy-Item $hba $backup
Write-Host "Backup: $backup" -ForegroundColor DarkGray

try {
    # trust ONLY the postgres user from localhost; rules are read top-down, so prepend
    $trust = @(
        '# TEMPORARY (setup-db-admin.ps1) - removed automatically',
        'host    all    postgres    127.0.0.1/32    trust',
        'host    all    postgres    ::1/128         trust'
    )
    Set-Content -Path $hba -Value ($trust + (Get-Content $backup)) -Encoding ascii
    Restart-Pg
    Write-Host 'Temporary local access enabled.' -ForegroundColor Yellow

    # --- app role + database (idempotent) ---
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
    $sql | & $psql -U postgres -h localhost -d postgres -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) { throw "psql failed ($LASTEXITCODE)" }
    Write-Host "Role '$appUser' and database '$appDb' are ready." -ForegroundColor Green

    # --- optional: new password for postgres ---
    $answer = Read-Host 'Set a NEW password for the "postgres" superuser now? (y/n)'
    if ($answer -match '^(y|yes)$') {
        $toSecure = { param($s) [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
        # up to 3 attempts instead of failing on the first typo
        for ($try = 1; $try -le 3 -and -not $newPass; $try++) {
            Write-Host 'Requirements: at least 12 characters, letters AND digits.' -ForegroundColor DarkGray
            $plain1 = & $toSecure (Read-Host 'New password' -AsSecureString)
            $plain2 = & $toSecure (Read-Host 'Repeat password' -AsSecureString)
            if ($plain1 -ne $plain2) { Write-Host 'Passwords do not match, try again.' -ForegroundColor Red; continue }
            if ($plain1.Length -lt 12 -or $plain1 -notmatch '\d' -or $plain1 -notmatch '[A-Za-z]') {
                Write-Host 'Too weak: need 12+ characters with letters and digits, try again.' -ForegroundColor Red; continue
            }
            $newPass = $plain1
        }
        $plain1 = $null; $plain2 = $null
        if (-not $newPass) {
            Write-Host 'postgres password NOT changed (3 failed attempts). Run the script again when ready.' -ForegroundColor Red
        } else {
            # sent through stdin, not the command line, so it does not show up in the process list
            ("ALTER ROLE postgres WITH PASSWORD '" + $newPass.Replace("'", "''") + "';") | & $psql -U postgres -h localhost -d postgres -v ON_ERROR_STOP=1 -q
            if ($LASTEXITCODE -ne 0) { throw 'Failed to change postgres password' }
            Write-Host 'Password for "postgres" changed.' -ForegroundColor Green
        }
    }
}
finally {
    # always put the original security settings back
    Copy-Item $backup $hba -Force
    Restart-Pg
    Write-Host 'pg_hba.conf restored, password authentication is back on.' -ForegroundColor Cyan
}

# prove the new password works through normal (password) authentication
if ($newPass) {
    $env:PGPASSWORD = $newPass
    try {
        $who = & $psql -U postgres -h localhost -d postgres -w -t -A -c 'SELECT current_user' 2>&1
        if ($LASTEXITCODE -eq 0 -and "$who".Trim() -eq 'postgres') {
            Write-Host 'Verified: you can now log in as "postgres" with the new password.' -ForegroundColor Green
            Write-Host 'Save it in KeePassXC now (entry: "PostgreSQL 16 local - postgres").' -ForegroundColor Yellow
        } else {
            Write-Host "Verification FAILED: $who" -ForegroundColor Red
        }
    } finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        $newPass = $null
    }
}
