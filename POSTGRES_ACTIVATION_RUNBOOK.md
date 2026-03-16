# PostgreSQL Activation Runbook (Step-by-Step)

Date: 2026-03-15
Status: Blocked by network access to PostgreSQL (TCP 5432 closed from client machine)

## Current Verified State
- SSH to server is reachable: `51.79.255.147:54833`.
- PostgreSQL port is not reachable from this machine: `51.79.255.147:5432` timed out.
- App health currently reports `provider: mongo` and `mode: CENTRAL`.
- OpenSSH client is installed on this machine.
- PuTTY CLI tools (`plink`, `puttygen`) are not currently installed.

## Goal
Switch backend runtime from MongoDB to PostgreSQL and run all migrations safely.

## What Was Already Done
- `.env` updated with `DB_PROVIDER=postgres` and `POSTGRES_URL`.
- Migration runner fixed to load root `.env`.
- Migration commands are ready:
  - `npm run db:migrate:postgres:core`
  - `npm run db:migrate:postgres:sync`
  - `npm run db:migrate:postgres:events`
  - `npm run db:migrate:postgres:sync-failures`

## Blocker
From this workstation, PostgreSQL endpoint is unreachable:
- `Test-NetConnection 51.79.255.147 -Port 5432` => `TcpTestSucceeded: False`

## Using Your .ppk Key (Recommended)

If your key is in `.ppk` format, use one of these approaches:

### Option A: Convert .ppk to OpenSSH key (best for this runbook)

1. Install PuTTYgen (GUI) or PuTTY tools.

2. Convert key in PuTTYgen:
  - Open PuTTYgen
  - Load your `.ppk`
  - Conversions -> Export OpenSSH key
  - Save as e.g. `C:\\Users\\Patrick\\.ssh\\apollo_server_key`

3. Restrict key file permissions (PowerShell):

```powershell
icacls "C:\Users\Patrick\.ssh\apollo_server_key" /inheritance:r
icacls "C:\Users\Patrick\.ssh\apollo_server_key" /grant:r "$env:USERNAME:F"
```

4. Connect with OpenSSH:

```bash
ssh -i "C:/Users/Patrick/.ssh/apollo_server_key" -p 54833 xdgamboa@51.79.255.147
```

### Option B: Use PuTTY/plink directly with .ppk

If `plink` is installed:

```bash
plink -i "C:\path\to\your-key.ppk" -P 54833 xdgamboa@51.79.255.147
```

### If your .ppk has a passphrase

`plink -batch` cannot answer passphrase prompts. Use one of these:

1. Manual first login with plink (interactive) to enter passphrase once:

```bash
plink -i "C:\Users\Patrick\.ssh\keys\vps-key-abg.ppk" -P 54833 xdgamboa@51.79.255.147
```

2. Or load key in Pageant, enter passphrase once, then batch commands work:
  - Start `pageant.exe`
  - Add `vps-key-abg.ppk`
  - Enter passphrase
  - Run `plink -batch ...` commands

## Server-Side Fix Steps (Run on the remote Ubuntu server)

1. SSH into server:

```bash
ssh -p 54833 xdgamboa@51.79.255.147
```

If using converted OpenSSH key:

```bash
ssh -i "C:/Users/Patrick/.ssh/apollo_server_key" -p 54833 xdgamboa@51.79.255.147
```

2. Verify PostgreSQL service status:

```bash
sudo systemctl status postgresql
```

3. Ensure PostgreSQL listens on all interfaces (`0.0.0.0`):

```bash
sudo grep -n "^listen_addresses" /etc/postgresql/*/main/postgresql.conf
# edit file if needed:
sudo nano /etc/postgresql/<version>/main/postgresql.conf
# set:
# listen_addresses = '*'
```

4. Allow remote host access in `pg_hba.conf`:

```bash
sudo nano /etc/postgresql/<version>/main/pg_hba.conf
# add line (or stricter office IP CIDR):
# host    all    all    0.0.0.0/0    scram-sha-256
```

5. Restart PostgreSQL:

```bash
sudo systemctl restart postgresql
sudo systemctl status postgresql
```

6. Open firewall for 5432 (UFW example):

```bash
sudo ufw allow 5432/tcp
sudo ufw status
```

7. Optional: verify local server socket/port listening:

```bash
sudo ss -ltnp | grep 5432
```

## Database Bootstrap (Run once remote port is reachable)

1. From local machine in `Apollo/server`:

```bash
npm run db:migrate:postgres:core
npm run db:migrate:postgres:sync
npm run db:migrate:postgres:events
npm run db:migrate:postgres:sync-failures
```

2. Restart API service and verify health:

```bash
# if running directly
npm run dev

# check
curl http://localhost:3000/api/health
```

Expected result:

```json
{
  "status": "ok",
  "provider": "postgres",
  "mode": "CENTRAL"
}
```

## After Activation
- Run: `npm run test:sync-smoke`
- Verify sync endpoints are no longer skipped.
- Proceed to central/branch deployment split:
  - central server: `APP_RUNTIME_MODE=CENTRAL`
  - branch edge nodes: `APP_RUNTIME_MODE=BRANCH`
