# SmartWorkforce Kiosk -- One-click installer for branch PCs
# Run as Administrator: Right-click -> "Run with PowerShell"

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  SmartWorkforce Kiosk Installer" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

try {

# -- 1. Check Node.js ----------------------------------------------------------
Write-Host "Checking Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($nodeVersion)) {
    Write-Host "  Node.js not found. Please install Node.js LTS (v20 or v22) from https://nodejs.org" -ForegroundColor Red
    Write-Host "  Then re-run this installer." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
# Odd major versions (19, 21, 23) and v24+ lack prebuilt SQLite binaries.
# Auto-install Node LTS via winget if needed.
$nodeMajor = [int]($nodeVersion -replace 'v(\d+).*','$1')
$needsLts = ($nodeMajor -lt 18) -or ($nodeMajor % 2 -eq 1)
if ($needsLts) {
    Write-Host "  Node.js $nodeVersion is not an LTS release. Installing Node.js LTS automatically..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  winget install failed. Please install Node.js LTS (v22) from https://nodejs.org and re-run." -ForegroundColor Red
            Read-Host "Press Enter to exit"
            exit 1
        }
        # Refresh PATH so the new node.exe is visible in this session
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
        $nodeVersion = node --version 2>$null
        Write-Host "  Node.js LTS installed: $nodeVersion" -ForegroundColor Green
    } else {
        Write-Host "  winget not available. Please install Node.js LTS (v22) from https://nodejs.org and re-run." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "  Node.js found: $nodeVersion" -ForegroundColor Green
}

# -- 2. Ask for config ---------------------------------------------------------
Write-Host ""
Write-Host "Configuration" -ForegroundColor Yellow
Write-Host "  (Press Enter to use the default shown in brackets)" -ForegroundColor DarkGray
Write-Host ""

$defaultUrl = "https://abg-hrd.dewebnetsolution.com"
$centralUrl = Read-Host "  Central server URL [$defaultUrl]"
if ([string]::IsNullOrWhiteSpace($centralUrl)) { $centralUrl = $defaultUrl }

$tenantCode = ""
while ([string]::IsNullOrWhiteSpace($tenantCode)) {
    $tenantCode = Read-Host "  Tenant / company code (e.g. ABG)"
    if ([string]::IsNullOrWhiteSpace($tenantCode)) {
        Write-Host "  Tenant code is required." -ForegroundColor Red
    }
}
$tenantCode = $tenantCode.ToUpper().Trim()

# -- 3. Write .env -------------------------------------------------------------
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath   = Join-Path $scriptDir ".env"

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

# -- 4. npm install ------------------------------------------------------------
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow
Set-Location $scriptDir
npm install --omit=dev
Write-Host "  Dependencies installed." -ForegroundColor Green

# -- 5. Download face models + build kiosk UI ----------------------------------
Write-Host ""
Write-Host "Downloading face recognition models..." -ForegroundColor Yellow
Write-Host "  (This only runs once - may take a minute)" -ForegroundColor DarkGray
npm run setup
Write-Host "  Setup complete." -ForegroundColor Green

# -- 6. Install PM2 + register as Windows service -----------------------------
Write-Host ""
Write-Host "Installing PM2 service manager..." -ForegroundColor Yellow
npm install -g pm2 pm2-windows-startup 2>$null
pm2 start index.js --name smartworkforce-kiosk
pm2-startup install
pm2 save
Write-Host "  PM2 service installed. Kiosk will auto-start on boot." -ForegroundColor Green

# -- 7. Create desktop shortcut (Chrome kiosk mode) ---------------------------
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
        $desktop    = [Environment]::GetFolderPath("Desktop")
        $shortcut   = Join-Path $desktop "SmartWorkforce Kiosk.lnk"
        $wsh        = New-Object -ComObject WScript.Shell
        $lnk        = $wsh.CreateShortcut($shortcut)
        $lnk.TargetPath       = $chrome
        $lnk.Arguments        = "--kiosk http://localhost:4000/kiosk --no-first-run --disable-infobars --disable-session-crashed-bubble"
        $lnk.Description      = "SmartWorkforce Kiosk"
        $lnk.WorkingDirectory = Split-Path $chrome
        $lnk.Save()
        Write-Host "  Shortcut created on desktop: SmartWorkforce Kiosk" -ForegroundColor Green
    } catch {
        Write-Host "  Could not create shortcut automatically ($_)" -ForegroundColor DarkYellow
        Write-Host "  Manually create a Chrome shortcut with target:" -ForegroundColor DarkGray
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
Write-Host "  The kiosk service is now running on http://localhost:4000/kiosk" -ForegroundColor White
Write-Host "  It will auto-start every time this PC boots." -ForegroundColor White
Write-Host "  Use the SmartWorkforce Kiosk shortcut on the desktop to open it." -ForegroundColor White
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
