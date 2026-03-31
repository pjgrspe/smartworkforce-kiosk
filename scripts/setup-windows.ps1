param(
  [switch]$IncludeMockData,
  [switch]$StartServices,
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-WarnMsg {
  param([string]$Message)
  Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Ensure-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is not installed or not available in PATH."
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')
Set-Location $repoRoot

Write-Host 'DE WEBNET One-Click Setup (Windows)' -ForegroundColor Magenta
Write-Host "Repository: $repoRoot"

Write-Step 'Checking required commands'
Ensure-Command 'node'
Ensure-Command 'npm'
Write-Ok "Node: $(node --version)"
Write-Ok "npm:  $(npm --version)"

Write-Step 'Preparing environment files'
if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-WarnMsg 'Created root .env from .env.example. Review MONGODB_URI/JWT_SECRET before production.'
} else {
  Write-Ok 'Root .env already exists'
}

if ((Test-Path 'web/.env.example') -and (-not (Test-Path 'web/.env'))) {
  Copy-Item 'web/.env.example' 'web/.env'
  Write-WarnMsg 'Created web/.env from web/.env.example.'
} elseif (Test-Path 'web/.env') {
  Write-Ok 'web/.env already exists'
}

if (-not $SkipInstall) {
  Write-Step 'Installing root dependencies'
  npm install
  Write-Ok 'Root dependencies installed'

  Write-Step 'Installing server dependencies'
  Set-Location (Join-Path $repoRoot 'server')
  npm install
  Write-Ok 'Server dependencies installed'

  Write-Step 'Installing web dependencies'
  Set-Location (Join-Path $repoRoot 'web')
  npm install
  Write-Ok 'Web dependencies installed'

  Set-Location $repoRoot
} else {
  Write-WarnMsg 'Skipping npm install steps (-SkipInstall was provided)'
}

Write-Step 'Seeding default tenant and role accounts'
Set-Location (Join-Path $repoRoot 'server')
node scripts/seed.js
Write-Ok 'Default accounts seeded'

if ($IncludeMockData) {
  Write-Step 'Seeding mock payroll dataset'
  node scripts/seed-mock-payroll-dataset.js
  Write-Ok 'Mock data seeded'
}

Set-Location $repoRoot

if ($StartServices) {
  Write-Step 'Starting API and web dev servers in new PowerShell windows'
  Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$repoRoot\server'; npm run dev"
  Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$repoRoot\web'; npm run dev"
  Write-Ok 'Launched server and web dev terminals'
}

Write-Host ''
Write-Host 'Setup complete.' -ForegroundColor Green
Write-Host 'Default login accounts (password: admin123):'
Write-Host '  - admin@dewebnet.com'
Write-Host '  - clientadmin@dewebnet.com'
Write-Host '  - hr@dewebnet.com'
Write-Host '  - manager@dewebnet.com'
Write-Host '  - employee@dewebnet.com'
Write-Host '  - auditor@dewebnet.com'
Write-Host ''
Write-Host 'If services are not running, start manually:'
Write-Host "  1) cd '$repoRoot\server' ; npm run dev"
Write-Host "  2) cd '$repoRoot\web'    ; npm run dev"
