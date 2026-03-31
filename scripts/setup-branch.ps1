<#
.SYNOPSIS
    DE WEBNET Branch Node Setup Script

.DESCRIPTION
    Fully sets up a branch server machine:
    - Fixes PowerShell execution policy and Node.js PATH
    - Verifies prerequisites
    - Creates local PostgreSQL database and user
    - Writes branch .env and web .env configuration
    - Runs all database migrations
    - Seeds default admin accounts
    - Aligns local tenant and Head Office branch UUIDs to match HQ
    - Inserts the branch record locally
    - Requeues any dead letter sync events

.PARAMETER BranchUUID
    The UUID of this branch as registered on HQ.
    Get this from HQ after running the INSERT in Step 7 of the deployment guide.
    Example: "0e36c3bc-9779-473b-ad6d-706a80cf5129"

.PARAMETER BranchName
    Display name of the branch (e.g. "Cebu Branch").

.PARAMETER BranchCode
    Short code for the branch (e.g. "CBU"). Uppercase, no spaces.

.PARAMETER DbPassword
    Password for the local hris_admin PostgreSQL user.
    Use a strong password. Store it somewhere safe.

.PARAMETER PgSuperPassword
    Password for the postgres superuser (set during PostgreSQL installation).

.PARAMETER JwtSecret
    JWT secret. Must match HQ's JWT_SECRET exactly.

.PARAMETER SyncSecret
    Shared secret for sync authentication. Must match HQ's SYNC_SHARED_SECRET exactly.

.PARAMETER CentralUrl
    URL of the central HQ sync server. No trailing slash.
    Example: "http://51.79.255.147"

.PARAMETER PgPort
    Local PostgreSQL port. Default: 5432.

.PARAMETER StartServices
    If set, starts the app with npm run dev after setup completes.

.EXAMPLE
    .\setup-branch.ps1 `
        -BranchUUID "0e36c3bc-9779-473b-ad6d-706a80cf5129" `
        -BranchName "Cebu Branch" `
        -BranchCode "CBU" `
        -DbPassword "StrongPass123!" `
        -PgSuperPassword "yourPostgresPassword" `
        -JwtSecret "xK9mP2`$vL7@nQ4&wR8!jT5^hY3*cF6%bN1@dZ0" `
        -SyncSecret "ce3dff2954e94cebda3e2f30cfb893ffd23a89cfc29729b8c57fbc4b45e7fdce" `
        -CentralUrl "http://51.79.255.147" `
        -StartServices
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$BranchUUID,

    [Parameter(Mandatory = $true)]
    [string]$BranchName,

    [Parameter(Mandatory = $true)]
    [string]$BranchCode,

    [Parameter(Mandatory = $true)]
    [string]$DbPassword,

    [Parameter(Mandatory = $true)]
    [string]$PgSuperPassword,

    [Parameter(Mandatory = $true)]
    [string]$JwtSecret,

    [Parameter(Mandatory = $true)]
    [string]$SyncSecret,

    [Parameter(Mandatory = $true)]
    [string]$CentralUrl,

    [int]$PgPort = 5432,

    [switch]$StartServices
)

$ErrorActionPreference = 'Stop'

# ── Fix PowerShell execution policy and PATH ──────────────────────────────────

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
if ($env:PATH -notlike "*nodejs*") {
    $env:PATH += ";C:\Program Files\nodejs"
}

# ── HQ constants (must match HQ database exactly) ────────────────────────────

$HQ_TENANT_ID   = "a10cac9c-5907-4509-ad53-2744efae2e07"
$HQ_HO_BRANCH_ID = "cf1931a2-d710-424c-9eea-853d64d637e3"

# ── Helpers ───────────────────────────────────────────────────────────────────

function Write-Step { param([string]$m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok   { param([string]$m) Write-Host "    [OK]   $m" -ForegroundColor Green }
function Write-Warn { param([string]$m) Write-Host "    [WARN] $m" -ForegroundColor Yellow }
function Write-Fail { param([string]$m) Write-Host "    [FAIL] $m" -ForegroundColor Red; exit 1 }

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Fail "$Name is not installed or not in PATH."
    }
    Write-Ok "$Name found"
}

function Find-Psql {
    $inPath = Get-Command psql -ErrorAction SilentlyContinue
    if ($inPath) { return $inPath.Source }

    $candidates = Get-ChildItem "C:\Program Files\PostgreSQL" -Filter "psql.exe" -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notlike "*pgAdmin*" } |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($candidates) { return $candidates.FullName }

    Write-Fail "psql.exe not found. Make sure PostgreSQL is installed."
}

function Run-Sql {
    param([string]$Sql, [string]$Database = "postgres", [string]$User = "postgres")
    & $psql -h 127.0.0.1 -p $PgPort -U $User -d $Database -c $Sql 2>&1 | Out-Null
}

function Query-Sql {
    param([string]$Sql, [string]$Database = "postgres", [string]$User = "postgres")
    return & $psql -h 127.0.0.1 -p $PgPort -U $User -d $Database -tAc $Sql 2>&1
}

# ── Validate inputs ───────────────────────────────────────────────────────────

if ($BranchUUID -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') {
    Write-Fail "BranchUUID must be a valid UUID (e.g. 0e36c3bc-9779-473b-ad6d-706a80cf5129). Got: $BranchUUID"
}

if ($BranchCode -notmatch '^[A-Z0-9_-]+$') {
    Write-Fail "BranchCode must be uppercase letters, numbers, hyphens, or underscores. Got: $BranchCode"
}

$DbName   = "apollo_branch"
$DbUser   = "hris_admin"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

# ── Banner ────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  DE WEBNET Branch Node Setup" -ForegroundColor Magenta
Write-Host "  ─────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Branch Name : $BranchName ($BranchCode)"
Write-Host "  Branch UUID : $BranchUUID"
Write-Host "  Database    : $DbName  (port $PgPort)"
Write-Host "  Central URL : $CentralUrl"
Write-Host "  Repo Root   : $RepoRoot"
Write-Host ""

Set-Location $RepoRoot

# ── Step 1: Prerequisites ─────────────────────────────────────────────────────

Write-Step "Checking prerequisites"
Require-Command "node"
Require-Command "npm"
$psql = Find-Psql
Write-Ok "psql found: $psql"
Write-Ok "Node: $(node --version)"
Write-Ok "npm:  $(npm --version)"

# ── Step 2: Create PostgreSQL database and user ───────────────────────────────

Write-Step "Creating PostgreSQL database and user"

$env:PGPASSWORD = $PgSuperPassword

$checkUser = Query-Sql "SELECT 1 FROM pg_roles WHERE rolname='$DbUser';"
if ($checkUser -match '1') {
    Write-Ok "User '$DbUser' already exists — skipping create"
} else {
    Run-Sql "CREATE USER $DbUser WITH PASSWORD '$DbPassword';"
    Write-Ok "Created user '$DbUser'"
}

$checkDb = Query-Sql "SELECT 1 FROM pg_database WHERE datname='$DbName';"
if ($checkDb -match '1') {
    Write-Ok "Database '$DbName' already exists — skipping create"
} else {
    Run-Sql "CREATE DATABASE $DbName OWNER $DbUser;"
    Run-Sql "GRANT ALL PRIVILEGES ON DATABASE $DbName TO $DbUser;"
    Write-Ok "Created database '$DbName'"
}

# Grant schema access
Run-Sql "GRANT ALL ON SCHEMA public TO $DbUser;" -Database $DbName
Write-Ok "Schema access granted"

Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

# ── Step 3: Write root .env ───────────────────────────────────────────────────

Write-Step "Writing root .env"

$EnvContent = @"
# ── DATABASE ────────────────────────────────
DB_PROVIDER=postgres
POSTGRES_URL=postgresql://${DbUser}:${DbPassword}@127.0.0.1:${PgPort}/${DbName}
POSTGRES_POOL_MAX=15
POSTGRES_IDLE_TIMEOUT_MS=10000
POSTGRES_POOL_MIN=2
POSTGRES_CONN_TIMEOUT_MS=5000
POSTGRES_STATEMENT_TIMEOUT=30000

# ── SERVER ──────────────────────────────────
HTTP_PORT=3000
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173

# ── JWT ─────────────────────────────────────
# Must match HQ's JWT_SECRET exactly
JWT_SECRET=${JwtSecret}
JWT_EXPIRES_IN=12h

# ── WEBSOCKET ───────────────────────────────
WS_PORT=8080
WS_HOST=localhost

# ── SYNC ────────────────────────────────────
SYNC_RETRY_DELAY_MS=5000
SYNC_MAX_RETRIES=5
SYNC_DEAD_LETTER_ALARM_THRESHOLD=5
CONNECTIVITY_CHECK_INTERVAL_MS=10000
SYNC_WORKER_INTERVAL_MS=10000
SYNC_OUTBOX_BATCH_SIZE=50

CENTRAL_SYNC_URL=${CentralUrl}
BRANCH_ID=${BranchUUID}
SYNC_SHARED_SECRET=${SyncSecret}

# ── LOGGING ─────────────────────────────────
LOG_LEVEL=info
LOG_FILE_PATH=logs/dewebnet.log
LOG_MAX_FILES=30
LOG_MAX_SIZE=10485760

# ── ENVIRONMENT ─────────────────────────────
NODE_ENV=production
APP_RUNTIME_MODE=BRANCH
"@

$EnvPath = Join-Path $RepoRoot '.env'
$EnvContent | Set-Content -Path $EnvPath -Encoding UTF8
Write-Ok ".env written to $EnvPath"

# ── Step 4: Write web .env ────────────────────────────────────────────────────

Write-Step "Writing web .env"

$WebEnvContent = @"
VITE_API_URL=http://localhost:3000/api
VITE_WS_URL=ws://localhost:8080
"@

$WebEnvPath = Join-Path $RepoRoot 'web\.env'
$WebEnvContent | Set-Content -Path $WebEnvPath -Encoding UTF8
Write-Ok "web .env written to $WebEnvPath"

# ── Step 5: Install dependencies ──────────────────────────────────────────────

Write-Step "Installing dependencies"
Set-Location $RepoRoot
npm install --silent
Set-Location (Join-Path $RepoRoot 'server')
npm install --silent
Set-Location (Join-Path $RepoRoot 'web')
npm install --silent
Set-Location $RepoRoot
Write-Ok "All dependencies installed"

# ── Step 6: Run migrations ────────────────────────────────────────────────────

Write-Step "Running database migrations"
Set-Location (Join-Path $RepoRoot 'server')

$migrations = @(
    '0001_core_postgres.sql',
    '0002_sync_checkpoints.sql',
    '0003_sync_events.sql',
    '0004_sync_failure_handling.sql',
    '0005_domain_tables.sql',
    '0006_employee_documents.sql',
    '0007_reports_to.sql',
    '0008_production_hardening.sql',
    '0009_holidays_unique.sql'
)

foreach ($m in $migrations) {
    Write-Host "    Applying $m ..." -NoNewline
    node scripts/run-postgres-migration.js $m
    Write-Host " done" -ForegroundColor Green
}

Write-Ok "All migrations applied"

# ── Step 7: Seed admin accounts ───────────────────────────────────────────────

Write-Step "Seeding default admin accounts"
node scripts/seed-postgres-admin.js
Write-Ok "Admin accounts seeded (default password: admin123)"

# ── Step 8: Fix tenant and branch UUIDs to match HQ ──────────────────────────

Write-Step "Aligning local UUIDs with HQ"

$env:PGPASSWORD = $DbPassword

# Get the locally generated tenant UUID
$localTenantId = Query-Sql "SELECT id FROM tenants WHERE code = 'DEWEBNET';" -Database $DbName -User $DbUser

if (-not $localTenantId) {
    Write-Fail "Could not find local tenant with code DEWEBNET. Seed may have failed."
}

Write-Ok "Local tenant UUID: $localTenantId"

if ($localTenantId -ne $HQ_TENANT_ID) {
    # Fix tenant UUID
    $fixTenant = @"
BEGIN;
INSERT INTO tenants (id, name, code, contact_email, is_active)
VALUES ('$HQ_TENANT_ID', 'DE WEBNET', 'DEWEBNET_TMP', 'admin@dewebnet.com', TRUE);
UPDATE branches SET tenant_id = '$HQ_TENANT_ID' WHERE tenant_id = '$localTenantId';
UPDATE users SET tenant_id = '$HQ_TENANT_ID' WHERE tenant_id = '$localTenantId';
DELETE FROM tenants WHERE id = '$localTenantId';
UPDATE tenants SET code = 'DEWEBNET' WHERE id = '$HQ_TENANT_ID';
COMMIT;
"@
    & $psql -h 127.0.0.1 -p $PgPort -U $DbUser -d $DbName -c $fixTenant 2>&1 | Out-Null
    Write-Ok "Tenant UUID aligned to HQ: $HQ_TENANT_ID"
} else {
    Write-Ok "Tenant UUID already matches HQ — skipping"
}

# Get the locally generated HO branch UUID
$localHoBranchId = Query-Sql "SELECT id FROM branches WHERE code = 'HO' AND tenant_id = '$HQ_TENANT_ID';" -Database $DbName -User $DbUser

if ($localHoBranchId -and $localHoBranchId -ne $HQ_HO_BRANCH_ID) {
    $fixHoBranch = @"
BEGIN;
UPDATE users SET branch_id = NULL WHERE branch_id = '$localHoBranchId';
DELETE FROM sync_outbox WHERE branch_id = '$localHoBranchId';
DELETE FROM sync_inbound_failures WHERE branch_id = '$localHoBranchId';
DELETE FROM sync_dead_letter WHERE branch_id = '$localHoBranchId';
DELETE FROM sync_checkpoints WHERE branch_id = '$localHoBranchId';
UPDATE branches SET id = '$HQ_HO_BRANCH_ID' WHERE id = '$localHoBranchId';
UPDATE users SET branch_id = '$HQ_HO_BRANCH_ID' WHERE branch_id IS NULL;
COMMIT;
"@
    & $psql -h 127.0.0.1 -p $PgPort -U $DbUser -d $DbName -c $fixHoBranch 2>&1 | Out-Null
    Write-Ok "Head Office branch UUID aligned to HQ: $HQ_HO_BRANCH_ID"
} else {
    Write-Ok "Head Office branch UUID already matches HQ — skipping"
}

# ── Step 9: Insert this branch record locally ─────────────────────────────────

Write-Step "Inserting branch record locally"

$checkBranch = Query-Sql "SELECT 1 FROM branches WHERE id = '$BranchUUID';" -Database $DbName -User $DbUser
if ($checkBranch -match '1') {
    Write-Ok "Branch '$BranchName' already exists locally — skipping"
} else {
    $insertBranch = @"
INSERT INTO branches (id, tenant_id, name, code, is_active, created_at, updated_at)
VALUES ('$BranchUUID', '$HQ_TENANT_ID', '$BranchName', '$BranchCode', TRUE, NOW(), NOW());
"@
    & $psql -h 127.0.0.1 -p $PgPort -U $DbUser -d $DbName -c $insertBranch 2>&1 | Out-Null
    Write-Ok "Branch '$BranchName' ($BranchCode) inserted with UUID $BranchUUID"
}

Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

# ── Step 10: Requeue dead letter events ───────────────────────────────────────

Write-Step "Requeuing any dead letter sync events"
Set-Location (Join-Path $RepoRoot 'server')
node scripts/requeue-dead-letter.js
Write-Ok "Dead letter requeue complete"

Set-Location $RepoRoot

# ── Step 11: Start services (optional) ───────────────────────────────────────

if ($StartServices) {
    Write-Step "Starting services"
    npm run dev
}

# ── Done ──────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "  ─────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Branch      : $BranchName ($BranchCode)"
Write-Host "  Branch UUID : $BranchUUID"
Write-Host "  Local API   : http://localhost:3000"
Write-Host "  Frontend    : http://localhost:5173"
Write-Host "  Kiosk       : http://localhost:5173/kiosk?tenant=DEWEBNET"
Write-Host "  Central     : $CentralUrl"
Write-Host ""
Write-Host "  Default logins:" -ForegroundColor Yellow
Write-Host "    admin@dewebnet.com       / admin123  (super_admin)" -ForegroundColor Yellow
Write-Host "    clientadmin@dewebnet.com / admin123  (client_admin)" -ForegroundColor Yellow
Write-Host "  Change passwords after first login." -ForegroundColor Yellow
Write-Host ""

if (-not $StartServices) {
    Write-Host "  To start the app:" -ForegroundColor Cyan
    Write-Host "    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass"
    Write-Host "    `$env:PATH += `";C:\Program Files\nodejs`""
    Write-Host "    npm run dev"
    Write-Host ""
}
