$ErrorActionPreference = 'Stop'

$hostName = '51.79.255.147'
$port = 54833
$user = 'xdgamboa'
$password = '<%UyRH41KbQzOt[uiv*|Qey?q2iX6<'
$plink = 'C:\Program Files\PuTTY\plink.exe'

$remoteScriptTemplate = @'
set -e
PW='__PW__'
printf '%s\n' "$PW" | sudo -S -p '' sed -i "s|^#listen_addresses = 'localhost'.*|listen_addresses = '*'|" /etc/postgresql/16/main/postgresql.conf
grep -qF "host    all             all             0.0.0.0/0            scram-sha-256" /etc/postgresql/16/main/pg_hba.conf || echo "host    all             all             0.0.0.0/0            scram-sha-256" | sudo tee -a /etc/postgresql/16/main/pg_hba.conf >/dev/null
printf '%s\n' "$PW" | sudo -S -p '' systemctl restart postgresql
grep -n "listen_addresses" /etc/postgresql/16/main/postgresql.conf
printf '%s\n' "$PW" | sudo -S -p '' ss -ltnp | grep 5432
'@

$remoteScript = $remoteScriptTemplate.Replace('__PW__', $password)
$remoteScript = $remoteScript -replace "`r`n", "`n"
$remoteScript = $remoteScript -replace "`r", ""

$tempScript = Join-Path $env:TEMP 'apollo_pg_remote_fix.sh'
[System.IO.File]::WriteAllText($tempScript, $remoteScript + "`n", (New-Object System.Text.UTF8Encoding($false)))

$bytes = [System.IO.File]::ReadAllBytes($tempScript)
if ($bytes -contains 13) {
  throw 'Temporary script contains CR characters.'
}

Get-Content -Raw -Encoding utf8 $tempScript | & $plink -batch -agent -P $port "$user@$hostName" bash -s
