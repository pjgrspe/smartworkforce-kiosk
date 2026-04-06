/* eslint-disable no-console */

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const BRANCH_ID = process.env.BRANCH_ID || '';
const SYNC_SHARED_SECRET = process.env.SYNC_SHARED_SECRET || '';

function headers() {
  return SYNC_SHARED_SECRET ? { 'x-sync-secret': SYNC_SHARED_SECRET } : {};
}

async function getJson(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: headers(),
  });

  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

async function postJson(path, payload, extraHeaders = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers(),
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

function printResult(label, result) {
  if (result.ok) {
    console.log(`OK   ${label} (${result.status})`);
  } else {
    console.log(`FAIL ${label} (${result.status})`);
    console.log('     ', JSON.stringify(result.body));
  }
}

async function main() {
  console.log('Sync smoke test');
  console.log(`Base URL: ${BASE_URL}`);

  const health = await getJson('/api/health');
  printResult('GET /api/health', health);

  const provider = health?.body?.provider;
  if (provider && provider !== 'postgres') {
    console.log(`SKIP sync endpoint checks (active provider is ${provider})`);
    if (!health.ok) process.exit(1);
    return;
  }

  const statusPath = BRANCH_ID
    ? `/api/sync/status?branchId=${encodeURIComponent(BRANCH_ID)}`
    : '/api/sync/status';
  const status = await getJson(statusPath);
  printResult('GET /api/sync/status', status);

  const testEvent = {
    eventType: 'smoke.test',
    entityType: 'smoke',
    entityId: null,
    branchId: BRANCH_ID || null,
    payload: {
      emittedAt: new Date().toISOString(),
      source: 'smoke-sync-script',
    },
  };

  const ingest = await postJson('/api/sync/events', testEvent, {
    'x-idempotency-key': `smoke-${Date.now()}`,
  });
  printResult('POST /api/sync/events', ingest);

  if (BRANCH_ID) {
    const pull = await getJson(`/api/sync/events/pull?branchId=${encodeURIComponent(BRANCH_ID)}&after=0&limit=5`);
    printResult('GET /api/sync/events/pull', pull);
  } else {
    console.log('SKIP GET /api/sync/events/pull (set BRANCH_ID to test pull)');
  }

  if (!health.ok || !status.ok || !ingest.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Smoke sync test failed:', err.message);
  process.exit(1);
});
