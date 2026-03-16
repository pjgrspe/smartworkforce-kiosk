<#
.SYNOPSIS
    DE WEBNET Branch Node Setup Script

.DESCRIPTION
    Fully sets up a branch server machine:
    - Verifies prerequisites
    - Creates local PostgreSQL database and user
    - Writes branch .env configuration
    - Runs all database migrations
    - Seeds default admin accounts
    - Starts all services via PM2

.PARAMETER BranchId
    Unique identifier for this branch (e.g. "branch-manila-001").
    Used in the DB name and sync registration. Must be URL-safe (letters, numbers, hyphens only).

.PARAMETER DbPassword
    Password for the local hris_admin PostgreSQL user.
    Use a strong password. Store it somewhere safe.

.PARAMETER CentralUrl
    URL of the central sync server (e.g. "http://51.79.255.147").
    No trailing slash.

.PARAMETER SyncSecret
    Shared secret for branch-to-central sync authentication.
    Must match the SYNC_SHARED_SECRET on the central server.

.PARAMETER PgPort
    Local PostgreSQL port. Default: 15432.

.PARAMETER PgSuperPassword
    Password for the postgres superuser (needed to create DB/user).
    This is the password you set during PostgreSQL installation.

.PARAMETER StartServices
    If set, starts PM2 services after setup completes.

.EXAMPLE
    .\setup-branch.ps1 `
        -BranchId "branch-manila-001" `
        -DbPassword "StrongPass123!" `
        -CentralUrl "http://51.79.255.147" `
        -SyncSecret "ce3dff2954e94cebda3e2f30cfb893ffd23a89cfc29729b8c57fbc4b45e7fdce" `
        -PgSuperPassword "yourPostgresPassword" `
        -StartServices
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$BranchId,

    [Parameter(Mandatory = $true)]
    [string]$DbPassword,

    [Parameter(Mandatory = $true)]
    [string]$CentralUrl,

    [Parameter(Mandatory = $true)]
    [string]$SyncSecret,

    [Parameter(Mandatory = $true)]
    [string]$PgSuperPassword,

    [int]$PgPort = 15432,

    [switch]$StartServices
)

$ErrorActionPreference = 'Stop'

# ── Helpers ──────────────────────────────────────────────────────────────────

function Write-Step  { param([string]$m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok    { param([string]$m) Write-Host "    [OK]   $m" -ForegroundColor Green }
function Write-Warn  { param([string]$m) Write-Host "    [WARN] $m" -ForegroundColor Yellow }
function Write-Fail  { param([string]$m) Write-Host "    [FAIL] $m" -ForegroundColor Red; exit 1 }

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Fail "$Name is not installed or not in PATH."
    }
    Write-Ok "$Name found: $((Get-Command $Name).Source)"
}

function Find-Psql {
    # Try PATH first
    $inPath = Get-Command psql -ErrorAction SilentlyContinue
    if ($inPath) { return $inPath.Source }

    # Search common install locations
    $candidates = Get-ChildItem "C:\Program Files\PostgreSQL" -Filter "psql.exe" -Recurse -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($candidates) { return $candidates.FullName }

    Write-Fail "psql.exe not found. Make sure PostgreSQL is installed."
}

# ── Validate BranchId ────────────────────────────────────────────────────────

if ($BranchId -notmatch '^[a-z0-9-]+$') {
    Write-Fail "BranchId must contain only lowercase letters, numbers, and hyphens. Got: $BranchId"
}

$DbName   = "apollo_$($BranchId -replace '-','_')"
$DbUser   = "hris_admin"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

# ── Banner ───────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  DE WEBNET Branch Node Setup" -ForegroundColor Magenta
Write-Host "  ─────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Branch ID   : $BranchId"
Write-Host "  Database    : $DbName  (port $PgPort)"
Write-Host "  DB User     : $DbUser"
Write-Host "  Central URL : $CentralUrl"
Write-Host "  Repo Root   : $RepoRoot"
Write-Host ""

Set-Location $RepoRoot

# ── Step 1: Prerequisites ────────────────────────────────────────────────────

Write-Step "Checking prerequisites"
Require-Command "node"
Require-Command "npm"
Require-Command "pm2"
$psql = Find-Psql
Write-Ok "psql found: $psql"
Write-Ok "Node: $(node --version)"
Write-Ok "npm:  $(npm --version)"
Write-Ok "pm2:  $(pm2 --version)"

# ── Step 2: Create PostgreSQL database and user ──────────────────────────────

Write-Step "Creating PostgreSQL database and user"

$env:PGPASSWORD = $PgSuperPassword

$checkUser = & $psql -h 127.0.0.1 -p $PgPort -U postgres -tAc `
    "SELECT 1 FROM pg_roles WHERE rolname='$DbUser';" 2>&1

if ($checkUser -match '1') {
    Write-Ok "User '$DbUser' already exists — skipping create"
} else {
    & $psql -h 127.0.0.1 -p $PgPort -U postgres -c `
        "CREATE USER $DbUser WITH PASSWORD '$DbPassword';" | Out-Null
    Write-Ok "Created user '$DbUser'"
}

$checkDb = & $psql -h 127.0.0.1 -p $PgPort -U postgres -tAc `
    "SELECT 1 FROM pg_database WHERE datname='$DbName';" 2>&1

if ($checkDb -match '1') {
    Write-Ok "Database '$DbName' already exists — skipping create"
} else {
    & $psql -h 127.0.0.1 -p $PgPort -U postgres -c `
        "CREATE DATABASE $DbName OWNER $DbUser;" | Out-Null
    & $psql -h 127.0.0.1 -p $PgPort -U postgres -c `
        "GRANT ALL PRIVILEGES ON DATABASE $DbName TO $DbUser;" | Out-Null
    Write-Ok "Created database '$DbName'"
}

Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

# ── Step 3: Write .env ───────────────────────────────────────────────────────

Write-Step "Writing .env"

$JwtSecret   = [System.Web.Security.Membership]::GeneratePassword(48, 8) 2>$null
if (-not $JwtSecret) {
    # Fallback: derive from branch ID + sync secret
    $JwtSecret = "$SyncSecret-$BranchId-jwt" | ForEach-Object {
        [System.BitConverter]::ToString(
            [System.Security.Cryptography.SHA256]::Create().ComputeHash(
                [System.Text.Encoding]::UTF8.GetBytes($_)
            )
        ) -replace '-',''
    }
}

$EnvContent = @"
# ============================================
# DE WEBNET Branch Node Configuration
# Branch: $BranchId
# Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
# ============================================

# ============================================
# DATABASE
# ============================================
DB_PROVIDER=postgres
APP_RUNTIME_MODE=BRANCH

POSTGRES_URL=postgresql://${DbUser}:${DbPassword}@127.0.0.1:${PgPort}/${DbName}
POSTGRES_POOL_MAX=15
POSTGRES_IDLE_TIMEOUT_MS=10000

# ============================================
# HTTP API SERVER
# ============================================
HTTP_PORT=3000
CORS_ORIGIN=*

# ============================================
# JWT
# ============================================
JWT_SECRET=$JwtSecret
JWT_EXPIRES_IN=12h

# ============================================
# WEBSOCKET SERVER
# ============================================
WS_PORT=8080
WS_HOST=0.0.0.0

# ============================================
# SYNC CONFIGURATION
# ============================================
CENTRAL_SYNC_URL=$CentralUrl
BRANCH_ID=$BranchId
SYNC_SHARED_SECRET=$SyncSecret
SYNC_WORKER_INTERVAL_MS=10000
SYNC_RETRY_DELAY_MS=5000
SYNC_MAX_RETRIES=5
SYNC_OUTBOX_BATCH_SIZE=50
CONNECTIVITY_CHECK_INTERVAL_MS=10000

# ============================================
# AI ENGINE
# ============================================
CAMERA_INDEX=0
CONFIDENCE_THRESHOLD=0.6
FPS=15
FRAME_WIDTH=640
FRAME_HEIGHT=480
RECOGNITION_COOLDOWN_MINUTES=5

# ============================================
# OFFLINE BUFFER
# ============================================
NEDB_COMPACTION_INTERVAL_MS=86400000

# ============================================
# LOGGING
# ============================================
LOG_LEVEL=info
LOG_FILE_PATH=logs/dewebnet.log
LOG_MAX_FILES=30
LOG_MAX_SIZE=10485760

# ============================================
# ENVIRONMENT
# ============================================
NODE_ENV=production
"@

$EnvPath = Join-Path $RepoRoot '.env'
$EnvContent | Set-Content -Path $EnvPath -Encoding UTF8
Write-Ok ".env written to $EnvPath"

# ── Step 4: Install dependencies ─────────────────────────────────────────────

Write-Step "Installing dependencies"
Set-Location $RepoRoot
npm install --silent
Set-Location (Join-Path $RepoRoot 'server')
npm install --silent
Set-Location (Join-Path $RepoRoot 'web')
npm install --silent
Set-Location $RepoRoot
Write-Ok "All dependencies installed"

# ── Step 5: Run migrations ───────────────────────────────────────────────────

Write-Step "Running database migrations"
Set-Location (Join-Path $RepoRoot 'server')

$migrations = @(
    '0001_core_postgres.sql',
    '0002_sync_checkpoints.sql',
    '0003_sync_events.sql',
    '0004_sync_failure_handling.sql',
    '0005_domain_tables.sql'
)

foreach ($m in $migrations) {
    Write-Host "    Applying $m ..." -NoNewline
    node scripts/run-postgres-migration.js $m
    Write-Host " done" -ForegroundColor Green
}

Write-Ok "All migrations applied"

# ── Step 6: Seed admin accounts ──────────────────────────────────────────────

Write-Step "Seeding default admin accounts"
node scripts/seed-postgres-admin.js
Write-Ok "Admin accounts seeded (default password: admin123)"

# ── Step 7: Build web app ────────────────────────────────────────────────────

Write-Step "Building web app"
Set-Location (Join-Path $RepoRoot 'web')
npm run build
Write-Ok "Web app built"

Set-Location $RepoRoot

# ── Step 8: Start services (optional) ────────────────────────────────────────

if ($StartServices) {
    Write-Step "Starting services via PM2"
    pm2 start pm2.ecosystem.config.js
    pm2 save
    Write-Ok "PM2 services started"
    Write-Host ""
    pm2 list
}

# ── Done ─────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "  ─────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Branch ID   : $BranchId"
Write-Host "  Local API   : http://localhost:3000"
Write-Host "  Frontend    : http://localhost:5173"
Write-Host "  Central     : $CentralUrl"
Write-Host ""
Write-Host "  Default login  admin@dewebnet.com / admin123" -ForegroundColor Yellow
Write-Host "  Change this password immediately after first login." -ForegroundColor Yellow
Write-Host ""

if (-not $StartServices) {
    Write-Host "  To start services:" -ForegroundColor Cyan
    Write-Host "    pm2 start pm2.ecosystem.config.js"
    Write-Host "    pm2 save"
    Write-Host ""
}
