/**
 * Auto-updater for the kiosk-service.
 * Periodically checks the remote git repo for a new release tag.
 * If a newer tag is found, checks it out and restarts via PM2.
 */

const { spawnSync } = require('child_process');

const CHECK_INTERVAL_MS = Number(process.env.UPDATE_CHECK_INTERVAL_MS) || 5 * 60 * 1000;
// TAG_PREFIX can be set explicitly, or falls back to lowercase TENANT_CODE + "-v" (e.g. ABG → abg-v)
const TAG_PREFIX = (
  (process.env.TAG_PREFIX || '').trim() ||
  ((process.env.TENANT_CODE || '').trim().toLowerCase()
    ? (process.env.TENANT_CODE).trim().toLowerCase() + '-v'
    : '')
);

let _availableUpdate = null; // { tag, sha } when a newer tag exists, else null

function run(cmd) {
  return spawnSync(cmd, {
    shell: true,
    encoding: 'utf8',
    cwd: __dirname,
    windowsHide: true,
  });
}

function checkForUpdate() {
  try {
    if (run('git fetch --tags --quiet').status !== 0) return;

    const allTags = run('git tag --sort=-version:refname').stdout.trim().split('\n').filter(Boolean);
    const tags = TAG_PREFIX ? allTags.filter(t => t.startsWith(TAG_PREFIX)) : allTags;
    const latestTag = tags[0];
    if (!latestTag) return;

    const headSha      = run('git rev-parse HEAD').stdout.trim();
    const latestTagSha = run(`git rev-parse "${latestTag}^{}"`).stdout.trim();

    if (headSha === latestTagSha) {
      _availableUpdate = null;
      console.log(`[updater] Already on latest release (${latestTag})`);
    } else {
      _availableUpdate = { tag: latestTag, sha: latestTagSha };
      console.log(`[updater] Update available: ${latestTag} — applying...`);
      applyUpdate();
    }
  } catch (err) {
    console.error('[updater] Check error:', err.message);
  }
}

function applyUpdate() {
  if (!_availableUpdate) return { ok: false, error: 'No update available' };
  const { tag } = _availableUpdate;
  try {
    if (run(`git checkout "${tag}"`).status !== 0) return { ok: false, error: 'git checkout failed' };
    _availableUpdate = null;
    console.log(`[updater] Updated to ${tag} — restarting...`);
    run('pm2 restart smartworkforce-kiosk --update-env');
    return { ok: true, tag };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function getAvailableUpdate() { return _availableUpdate; }

function start() {
  if (!TAG_PREFIX) {
    console.warn('[updater] WARNING: TAG_PREFIX not set in .env — updater disabled. Set TAG_PREFIX=abg-v or TAG_PREFIX=spcf-v.');
    return;
  }
  console.log(`[updater] Started — tag prefix: ${TAG_PREFIX}, checking every ${CHECK_INTERVAL_MS / 1000}s`);
  setTimeout(() => {
    checkForUpdate();
    setInterval(checkForUpdate, CHECK_INTERVAL_MS);
  }, 30_000);
}

module.exports = { start, getAvailableUpdate, applyUpdate };
