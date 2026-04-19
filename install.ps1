# SmartWorkforce Kiosk -- Installer & Updater
# Run this script for both fresh installs and updates.
# Right-click -> "Run with PowerShell"

# Self-elevate with admin rights + bypass execution policy
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    try {
        Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -NoProfile -File `"$PSCommandPath`"" -Verb RunAs -ErrorAction Stop
    } catch {
        Write-Host "Could not launch as Administrator. Please right-click the file and select 'Run as administrator'." -ForegroundColor Red
        Read-Host "Press Enter to exit"
    }
    exit
}

$ErrorActionPreference = "Stop"

$REPO_OWNER  = "pjgrspe"
$REPO_NAME   = "smartworkforce-kiosk"
$REPO_URL    = "https://github.com/$REPO_OWNER/$REPO_NAME.git"
$INSTALL_DIR = "C:\SmartWorkforce"
$isUpdate    = Test-Path (Join-Path $INSTALL_DIR ".git")
$success     = $false

try {

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  SmartWorkforce Kiosk" -ForegroundColor Cyan
if ($isUpdate) {
    Write-Host "  Updater" -ForegroundColor Cyan
} else {
    Write-Host "  Installer" -ForegroundColor Cyan
}
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# -- 1. Check / install Node.js ------------------------------------------------
Write-Host "Checking Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
$nodeMissing = $LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($nodeVersion)
if (-not $nodeMissing) {
    $nodeMajor = [int]($nodeVersion -replace 'v(\d+).*','$1')
    if ($nodeMajor -lt 18 -or $nodeMajor % 2 -eq 1) { $nodeMissing = $true }
}
if ($nodeMissing) {
    Write-Host "  Node.js LTS not found. Installing..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -ne 0) { throw "winget failed to install Node.js. Install Node.js LTS from https://nodejs.org and re-run." }
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
        Write-Host "  Node.js installed: $(node --version)" -ForegroundColor Green
    } else {
        throw "winget not available. Install Node.js LTS from https://nodejs.org and re-run."
    }
} else {
    Write-Host "  Node.js OK: $nodeVersion" -ForegroundColor Green
}

# -- 2. Check / install Git ----------------------------------------------------
Write-Host ""
Write-Host "Checking Git..." -ForegroundColor Yellow
$gitVersion = git --version 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($gitVersion)) {
    Write-Host "  Git not found. Installing..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -ne 0) { throw "winget failed to install Git. Install Git from https://git-scm.com and re-run." }
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
        Write-Host "  Git installed." -ForegroundColor Green
    } else {
        throw "winget not available. Install Git from https://git-scm.com and re-run."
    }
} else {
    Write-Host "  Git OK: $gitVersion" -ForegroundColor Green
}

# -- 3. Fetch latest release tag from GitHub -----------------------------------
Write-Host ""
Write-Host "Checking latest release..." -ForegroundColor Yellow
$latestTag    = $null
$releaseNotes = $null
try {
    $apiUrl   = "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases/latest"
    $headers  = @{ "User-Agent" = "SmartWorkforce-Installer" }
    $release  = Invoke-RestMethod -Uri $apiUrl -Headers $headers -TimeoutSec 10
    $latestTag    = $release.tag_name
    $releaseNotes = $release.body
    Write-Host "  Latest release: $latestTag" -ForegroundColor Green
} catch {
    # Fall back to latest git tag if API unavailable (e.g. private repo or rate limit)
    Write-Host "  Could not reach GitHub API, will use latest git tag." -ForegroundColor DarkYellow
}

# -- 4. Clone or update --------------------------------------------------------
Write-Host ""
if ($isUpdate) {
    Set-Location $INSTALL_DIR

    # Get current installed version (git describe exits non-zero when no tags; suspend Stop preference)
    $ErrorActionPreference = "Continue"
    $currentTag = git describe --tags --exact-match HEAD 2>$null
    if (-not $currentTag) { $currentTag = git describe --tags 2>$null }
    if (-not $currentTag) { $currentTag = "(unknown)" }
    $ErrorActionPreference = "Stop"
    Write-Host "  Installed version : $currentTag" -ForegroundColor White

    # Fetch all tags — always use the latest git tag as the source of truth.
    # The GitHub releases API only returns published Releases; CI pushes plain
    # tags, so the actual git tag list is always more up to date.
    git fetch --tags --quiet
    $ErrorActionPreference = "Continue"
    $latestTagFromGit = git tag --sort=-version:refname 2>$null | Select-Object -First 1
    $ErrorActionPreference = "Stop"
    if ($latestTagFromGit) { $latestTag = $latestTagFromGit }

    if (-not $latestTag) {
        throw "No release tags found in repository. Please tag a release on GitHub first."
    }

    Write-Host "  Latest version    : $latestTag" -ForegroundColor White

    if ($currentTag -eq $latestTag) {
        Write-Host "  Already on $latestTag - pulling latest build..." -ForegroundColor Green
        git checkout main
        git pull origin main
        git checkout $latestTag
    } else {
        Write-Host ""
        Write-Host "Updating $currentTag -> $latestTag..." -ForegroundColor Yellow
        if ($releaseNotes) {
            Write-Host ""
            Write-Host "  Release notes:" -ForegroundColor DarkGray
            $releaseNotes -split "`n" | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
            Write-Host ""
        }
        git checkout main
        git pull origin main
        git checkout $latestTag
        Write-Host "  Code updated to $latestTag." -ForegroundColor Green
    }

} else {
    if (-not $latestTag) {
        # No API + no existing install, clone main and get latest tag after
        Write-Host "Downloading kiosk software to $INSTALL_DIR..." -ForegroundColor Yellow
        if (Test-Path $INSTALL_DIR) { Remove-Item $INSTALL_DIR -Recurse -Force }
        git clone $REPO_URL $INSTALL_DIR
        Set-Location $INSTALL_DIR
        $latestTag = git tag --sort=-version:refname 2>$null | Select-Object -First 1
    } else {
        Write-Host "Downloading kiosk software ($latestTag) to $INSTALL_DIR..." -ForegroundColor Yellow
        if (Test-Path $INSTALL_DIR) { Remove-Item $INSTALL_DIR -Recurse -Force }
        git clone --branch $latestTag $REPO_URL $INSTALL_DIR
        Set-Location $INSTALL_DIR
    }
    Write-Host "  Download complete." -ForegroundColor Green
}

# -- 5. Configuration (always - allows switching company on update) -----------
Write-Host ""
Write-Host "Configuration" -ForegroundColor Yellow
Write-Host ""

$centralUrl = "https://spcf-hrd.dewebnetsolution.com"
Write-Host "  Checking server connection..." -ForegroundColor DarkGray
try {
    Invoke-WebRequest -Uri "$centralUrl/api/health" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop | Out-Null
    Write-Host "  Server reachable." -ForegroundColor Green
} catch {
    throw "Cannot reach the SmartWorkforce server. Make sure this PC has internet access and try again."
}

# Show current tenant code if updating
if ($isUpdate) {
    $currentEnv = Join-Path $INSTALL_DIR ".env"
    if (Test-Path $currentEnv) {
        $currentCode = (Get-Content $currentEnv | Where-Object { $_ -match "^TENANT_CODE=" }) -replace "^TENANT_CODE=", ""
        if ($currentCode) { Write-Host "  Current company code: $currentCode" -ForegroundColor DarkGray }
    }
}

$tenantCode = ""
while ([string]::IsNullOrWhiteSpace($tenantCode)) {
    $raw = Read-Host "  Tenant / company code (e.g. SPCF)"
    if ([string]::IsNullOrWhiteSpace($raw)) { Write-Host "  Tenant code is required." -ForegroundColor Red; continue }
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
            Write-Host "  Company code '$raw' not found. Please check and try again." -ForegroundColor Red
        } else {
            Write-Host "  Could not verify code. Server error - try again." -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Writing .env..." -ForegroundColor Yellow
$envContent = "CENTRAL_URL=$centralUrl`nTENANT_CODE=$tenantCode`nPORT=4000`nWS_PORT=4001`nSYNC_INTERVAL_MS=30000`nENCODING_REFRESH_INTERVAL_MS=600000`nDB_PATH=./data/kiosk.db"
Set-Content (Join-Path $INSTALL_DIR ".env") -Value $envContent -Encoding UTF8
Write-Host "  .env written." -ForegroundColor Green

# -- 6. npm install ------------------------------------------------------------
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow
Set-Location $INSTALL_DIR
npm install --omit=dev
Write-Host "  Dependencies ready." -ForegroundColor Green

# -- 7. Face models (skip if already present) ----------------------------------
$modelsDir   = Join-Path $INSTALL_DIR "public\models"
$modelsExist = (Test-Path $modelsDir) -and ((Get-ChildItem $modelsDir -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0)
if (-not $modelsExist) {
    Write-Host ""
    Write-Host "Downloading face recognition models (one-time, may take a minute)..." -ForegroundColor Yellow
    npm run setup
    Write-Host "  Models ready." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Face models already present, skipping download." -ForegroundColor DarkGray
}

# -- 8. PM2: install (fresh) or restart (update) ------------------------------
Write-Host ""
if ($isUpdate) {
    Write-Host "Restarting kiosk service..." -ForegroundColor Yellow
    $pm2Running = pm2 list 2>$null | Select-String "smartworkforce-kiosk"
    if ($pm2Running) {
        pm2 restart smartworkforce-kiosk
        Write-Host "  Service restarted." -ForegroundColor Green
    } else {
        Write-Host "  Service not running - starting it..." -ForegroundColor Yellow
        pm2 start index.js --name smartworkforce-kiosk
        pm2 save
        Write-Host "  Service started." -ForegroundColor Green
    }
} else {
    Write-Host "Installing PM2 service manager..." -ForegroundColor Yellow
    npm install -g pm2 pm2-windows-startup 2>$null
    pm2 start index.js --name smartworkforce-kiosk
    pm2-startup install
    pm2 save
    Write-Host "  PM2 service installed. Kiosk will auto-start on boot." -ForegroundColor Green
}

# -- 9. Desktop shortcut (fresh install only) ----------------------------------
if (-not $isUpdate) {
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
            Write-Host "  Shortcut created on desktop." -ForegroundColor Green
        } catch {
            Write-Host "  Could not create shortcut ($_)" -ForegroundColor DarkYellow
            Write-Host "  Manually create a shortcut to: `"$chrome`" --kiosk http://localhost:4000/kiosk" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "  Chrome not found. Install Chrome then create a shortcut to:" -ForegroundColor DarkYellow
        Write-Host "  chrome.exe --kiosk http://localhost:4000/kiosk" -ForegroundColor DarkGray
    }
}

# -- Done ----------------------------------------------------------------------
Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
if ($isUpdate) {
    Write-Host "  Updated to $latestTag!" -ForegroundColor Green
} else {
    Write-Host "  Installation complete! ($latestTag)" -ForegroundColor Green
}
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Installed to : $INSTALL_DIR" -ForegroundColor White
Write-Host "  Kiosk URL    : http://localhost:4000/kiosk" -ForegroundColor White
if (-not $isUpdate) {
    Write-Host "  Auto-starts on boot via PM2." -ForegroundColor White
}
Write-Host ""
Write-Host "  To update later, just re-run this script." -ForegroundColor DarkGray
$success = $true

} catch {
    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Red
    if ($isUpdate) {
        Write-Host "  Update failed!" -ForegroundColor Red
    } else {
        Write-Host "  Installation failed!" -ForegroundColor Red
    }
    Write-Host "=====================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "ERROR: $_" -ForegroundColor Red
    Write-Host ""
} finally {
    Read-Host "Press Enter to close"
}
