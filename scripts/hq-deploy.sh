#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# HQ Deploy Script — run this on the VPS after uploading files via WinSCP
# Usage: bash ~/hq-deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

# ── CONFIG ────────────────────────────────────────────────────────────────────
APP_DIR="/root/DEX/Apollo"          # adjust if different on your VPS
SERVER_DIR="$APP_DIR/server"
PM2_APP="de-webnet-central"         # adjust to match your pm2 app name

echo ""
echo "======================================================"
echo "  DE WEBNET HQ Deploy"
echo "======================================================"
echo ""

# ── 1. Confirm we're in the right place ──────────────────────────────────────
if [ ! -f "$SERVER_DIR/index.js" ]; then
  echo "ERROR: Cannot find $SERVER_DIR/index.js"
  echo "Edit APP_DIR at the top of this script to match where the project lives."
  exit 1
fi

echo "[1/6] Project found at $APP_DIR"

# ── 2. Update .env ────────────────────────────────────────────────────────────
echo "[2/6] Updating .env from vps.env..."
cp "$SERVER_DIR/vps.env" "$APP_DIR/.env"
echo "      Done."

# ── 3. Install/update npm dependencies ───────────────────────────────────────
echo "[3/6] Installing npm dependencies..."
cd "$SERVER_DIR"
npm install --production 2>&1 | tail -3
echo "      Done."

# ── 4. Run database migrations ───────────────────────────────────────────────
echo "[4/6] Running database migrations..."

# Load DB URL from .env
export $(grep -v '^#' "$APP_DIR/.env" | grep POSTGRES_URL | xargs)

run_migration() {
  local file="$1"
  local name=$(basename "$file")
  echo "      Applying $name ..."
  node -e "
    const { Pool } = require('pg');
    const fs = require('fs');
    const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
    const sql = fs.readFileSync('$file', 'utf8');
    pool.query(sql)
      .then(() => { console.log('      ✓ $name'); pool.end(); })
      .catch(e => { console.error('      ✗ $name:', e.message); pool.end(); process.exit(1); });
  "
}

MIGRATIONS_DIR="$SERVER_DIR/db/migrations"
run_migration "$MIGRATIONS_DIR/0001_core_postgres.sql"
run_migration "$MIGRATIONS_DIR/0002_sync_checkpoints.sql"
run_migration "$MIGRATIONS_DIR/0003_sync_events.sql"
run_migration "$MIGRATIONS_DIR/0004_sync_failure_handling.sql"
run_migration "$MIGRATIONS_DIR/0005_domain_tables.sql"
run_migration "$MIGRATIONS_DIR/0006_employee_documents.sql"
run_migration "$MIGRATIONS_DIR/0007_reports_to.sql"
run_migration "$MIGRATIONS_DIR/0008_production_hardening.sql"

echo "      All migrations done."

# ── 5. Seed admin accounts if not present ────────────────────────────────────
echo "[5/6] Ensuring admin accounts exist..."
cd "$SERVER_DIR"
node scripts/seed-postgres-admin.js 2>&1 | grep -E 'email|Tenant|Branch|Error' || true
echo "      Done."

# ── 6. Restart PM2 ───────────────────────────────────────────────────────────
echo "[6/6] Restarting PM2 app '$PM2_APP'..."
if pm2 describe "$PM2_APP" > /dev/null 2>&1; then
  pm2 restart "$PM2_APP"
  sleep 3
  pm2 show "$PM2_APP" | grep -E 'status|restarts|uptime' || true
else
  echo "      WARNING: PM2 app '$PM2_APP' not found."
  echo "      Current PM2 apps:"
  pm2 list
  echo ""
  echo "      To start fresh:"
  echo "        cd $APP_DIR && pm2 start pm2.ecosystem.config.js --only de-webnet-server"
  echo "        pm2 save"
fi

echo ""
echo "======================================================"
echo "  Deploy complete!"
echo "======================================================"
echo ""
echo "Quick health check:"
sleep 2
curl -s http://localhost:3000/api/health || echo "(health check failed — check pm2 logs)"
echo ""
echo "View logs:  pm2 logs $PM2_APP --lines 50"
echo ""
