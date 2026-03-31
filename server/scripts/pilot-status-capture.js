/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const branchId = process.env.BRANCH_ID || '';
const label = process.env.PILOT_LABEL || 'snapshot';
const syncSecret = process.env.SYNC_SHARED_SECRET || '';

if (!branchId) {
  console.error('BRANCH_ID is required for pilot status capture.');
  process.exit(1);
}

const headers = syncSecret ? { 'x-sync-secret': syncSecret } : {};

async function getJson(url) {
  const response = await fetch(url, { headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const health = await getJson(`${baseUrl}/api/health`);
  const status = await getJson(`${baseUrl}/api/sync/status?branchId=${encodeURIComponent(branchId)}`);

  const payload = {
    capturedAt: new Date().toISOString(),
    label,
    baseUrl,
    branchId,
    health,
    status,
  };

  const outDir = path.resolve(__dirname, '../../logs/pilot');
  fs.mkdirSync(outDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(outDir, `${label}-${stamp}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`Pilot status captured: ${filePath}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
