# SmartWorkforce Kiosk -- One-click installer for branch PCs
# Download this file and right-click -> "Run with PowerShell"

# Self-elevate with admin rights + bypass execution policy
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -NoProfile -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$ErrorActionPreference = "Stop"

$REPO_URL    = "https://github.com/pjgrspe/smartworkforce-kiosk.git"
$INSTALL_DIR = "C:\SmartWorkforce"

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  SmartWorkforce Kiosk Installer" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

try {

# -- 1. Check Node.js ----------------------------------------------------------
Write-Host "Checking Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
$nodeMissing = $LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($nodeVersion)
if (-not $nodeMissing) {
    $nodeMajor = [int]($nodeVersion -replace 'v(\d+).*','$1')
    if (($nodeMajor -lt 18) -or ($nodeMajor % 2 -eq 1)) { $nodeMissing = $true }
}
if ($nodeMissing) {
    Write-Host "  Node.js LTS not found. Installing automatically..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  winget install failed. Please install Node.js LTS from https://nodejs.org and re-run." -ForegroundColor Red
            Read-Host "Press Enter to exit"; exit 1
        }
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
        $nodeVersion = node --version 2>$null
        Write-Host "  Node.js LTS installed: $nodeVersion" -ForegroundColor Green
    } else {
        Write-Host "  winget not available. Please install Node.js LTS from https://nodejs.org and re-run." -ForegroundColor Red
        Read-Host "Press Enter to exit"; exit 1
    }
} else {
    Write-Host "  Node.js found: $nodeVersion" -ForegroundColor Green
}

# -- 2. Check Git --------------------------------------------------------------
Write-Host ""
Write-Host "Checking Git..." -ForegroundColor Yellow
$gitVersion = git --version 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($gitVersion)) {
    Write-Host "  Git not found. Installing automatically..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  winget install failed. Please install Git from https://git-scm.com and re-run." -ForegroundColor Red
            Read-Host "Press Enter to exit"; exit 1
        }
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
        Write-Host "  Git installed." -ForegroundColor Green
    } else {
        Write-Host "  winget not available. Please install Git from https://git-scm.com and re-run." -ForegroundColor Red
        Read-Host "Press Enter to exit"; exit 1
    }
} else {
    Write-Host "  Git found: $gitVersion" -ForegroundColor Green
}

# -- 3. Clone or update repo ---------------------------------------------------
Write-Host ""
if (Test-Path (Join-Path $INSTALL_DIR ".git")) {
    Write-Host "Updating existing installation at $INSTALL_DIR..." -ForegroundColor Yellow
    Set-Location $INSTALL_DIR
    git pull
    Write-Host "  Updated." -ForegroundColor Green
} else {
    Write-Host "Downloading kiosk software to $INSTALL_DIR..." -ForegroundColor Yellow
    if (Test-Path $INSTALL_DIR) { Remove-Item $INSTALL_DIR -Recurse -Force }
    git clone $REPO_URL $INSTALL_DIR
    Set-Location $INSTALL_DIR
    Write-Host "  Download complete." -ForegroundColor Green
}

# -- 4. Ask for config ---------------------------------------------------------
Write-Host ""
Write-Host "Configuration" -ForegroundColor Yellow
Write-Host ""

# 4a. Verify central server is reachable
$centralUrl = "https://abg-hrd.dewebnetsolution.com"
Write-Host "  Checking server connection..." -ForegroundColor DarkGray
try {
    Invoke-WebRequest -Uri "$centralUrl/api/health" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop | Out-Null
    Write-Host "  Server reachable." -ForegroundColor Green
} catch {
    Write-Host "  Cannot reach the SmartWorkforce server. Make sure this PC has internet access and try again." -ForegroundColor Red
    Read-Host "Press Enter to exit"; exit 1
}

# 4b. Tenant code — validate against server
$tenantCode = ""
while ([string]::IsNullOrWhiteSpace($tenantCode)) {
    $raw = Read-Host "  Tenant / company code (e.g. ABG)"
    if ([string]::IsNullOrWhiteSpace($raw)) {
        Write-Host "  Tenant code is required." -ForegroundColor Red
        continue
    }
    $raw = $raw.ToUpper().Trim()
    Write-Host "  Verifying company code with server..." -ForegroundColor DarkGray
    try {
        $resp = Invoke-WebRequest -Uri "$centralUrl/api/kiosk/validate-tenant?tenant=$raw" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        $json = $resp.Content | ConvertFrom-Json
        Write-Host "  Verified: $($json.name)" -ForegroundColor Green
        $tenantCode = $raw
    } catch {
        $status = $_.Exception.Response.StatusCode.Value__
        if ($status -eq 404) {
            Write-Host "  Company code '$raw' not found. Please check the code and try again." -ForegroundColor Red
        } else {
            Write-Host "  Could not verify code. Server error — try again." -ForegroundColor Red
        }
    }
}

# -- 5. Write .env -------------------------------------------------------------
$envPath = Join-Path $INSTALL_DIR ".env"
Write-Host ""
Write-Host "Writing .env..." -ForegroundColor Yellow
@"
CENTRAL_URL=$centralUrl
TENANT_CODE=$tenantCode
PORT=4000
WS_PORT=4001
SYNC_INTERVAL_MS=30000
ENCODING_REFRESH_INTERVAL_MS=600000
DB_PATH=./data/kiosk.db
"@ | Set-Content $envPath -Encoding UTF8
Write-Host "  .env written." -ForegroundColor Green

# -- 6. npm install ------------------------------------------------------------
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install --omit=dev
Write-Host "  Dependencies installed." -ForegroundColor Green

# -- 7. Download face models ---------------------------------------------------
Write-Host ""
Write-Host "Downloading face recognition models..." -ForegroundColor Yellow
Write-Host "  (This only runs once - may take a minute)" -ForegroundColor DarkGray
npm run setup
Write-Host "  Setup complete." -ForegroundColor Green

# -- 8. Install PM2 + register as Windows service -----------------------------
Write-Host ""
Write-Host "Installing PM2 service manager..." -ForegroundColor Yellow
npm install -g pm2 pm2-windows-startup 2>$null
pm2 start index.js --name smartworkforce-kiosk
pm2-startup install
pm2 save
Write-Host "  PM2 service installed. Kiosk will auto-start on boot." -ForegroundColor Green

# -- 9. Create desktop shortcut (Chrome kiosk mode) ---------------------------
Write-Host ""
Write-Host "Creating desktop shortcut..." -ForegroundColor Yellow

$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chrome) {
    try {
        $desktop  = [Environment]::GetFolderPath("Desktop")
        $shortcut = Join-Path $desktop "SmartWorkforce Kiosk.lnk"
        $wsh      = New-Object -ComObject WScript.Shell
        $lnk      = $wsh.CreateShortcut($shortcut)
        $lnk.TargetPath       = $chrome
        $lnk.Arguments        = "--kiosk http://localhost:4000/kiosk --no-first-run --disable-infobars --disable-session-crashed-bubble"
        $lnk.Description      = "SmartWorkforce Kiosk"
        $lnk.WorkingDirectory = Split-Path $chrome
        $lnk.Save()
        Write-Host "  Shortcut created on desktop: SmartWorkforce Kiosk" -ForegroundColor Green
    } catch {
        Write-Host "  Could not create shortcut automatically ($_)" -ForegroundColor DarkYellow
        Write-Host "  Manually create a Chrome shortcut pointing to:" -ForegroundColor DarkGray
        Write-Host "  `"$chrome`" --kiosk http://localhost:4000/kiosk --no-first-run --disable-infobars" -ForegroundColor DarkGray
    }
} else {
    Write-Host "  Chrome not found - skipping shortcut. Install Chrome and create a shortcut manually." -ForegroundColor DarkYellow
    Write-Host "  Target: chrome.exe --kiosk http://localhost:4000/kiosk" -ForegroundColor DarkGray
}

# -- Done ----------------------------------------------------------------------
Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Installed to: $INSTALL_DIR" -ForegroundColor White
Write-Host "  Kiosk URL:    http://localhost:4000/kiosk" -ForegroundColor White
Write-Host "  Auto-starts on boot via PM2." -ForegroundColor White
Write-Host ""
Write-Host "  To update later, just re-run this installer." -ForegroundColor DarkGray
Write-Host ""
Read-Host "Press Enter to close"

} catch {
    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Red
    Write-Host "  Installation failed!" -ForegroundColor Red
    Write-Host "=====================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "ERROR: $_" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}
