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

function run(cmd) {
  return spawnSync(cmd, {
    shell: true,
    encoding: 'utf8',
    cwd: __dirname,
    windowsHide: true,   // prevents CMD windows popping up on Windows
  });
}

function checkAndUpdate() {
  try {
    if (run('git fetch --tags --quiet').status !== 0) return;

    const allTags = run('git tag --sort=-version:refname').stdout.trim().split('\n').filter(Boolean);
    // Only consider tags matching this kiosk's prefix (e.g. spcf-v* or abg-v*)
    const tags = TAG_PREFIX ? allTags.filter(t => t.startsWith(TAG_PREFIX)) : allTags;
    const latestTag = tags[0];
    if (!latestTag) return;

    // Compare commit hashes — avoids false positives when on main/detached HEAD
    const headSha      = run('git rev-parse HEAD').stdout.trim();
    const latestTagSha = run(`git rev-parse "${latestTag}^{}"`).stdout.trim();

    if (headSha === latestTagSha) {
      console.log(`[updater] Already on latest release (${latestTag})`);
      return;
    }

    console.log(`[updater] New release detected: ${latestTag} — updating...`);

    if (run(`git checkout "${latestTag}"`).status !== 0) {
      console.error('[updater] git checkout failed');
      return;
    }

    console.log(`[updater] Updated to ${latestTag} — restarting...`);
    run('pm2 restart smartworkforce-kiosk --update-env');
  } catch (err) {
    console.error('[updater] Error:', err.message);
  }
}

function start() {
  if (!TAG_PREFIX) {
    console.warn('[updater] WARNING: TAG_PREFIX not set in .env — updater disabled to prevent cross-client tag pollution. Set TAG_PREFIX=abg-v or TAG_PREFIX=spcf-v.');
    return;
  }
  console.log(`[updater] Started — tag prefix: ${TAG_PREFIX}, checking every ${CHECK_INTERVAL_MS / 1000}s`);
  setTimeout(() => {
    checkAndUpdate();
    setInterval(checkAndUpdate, CHECK_INTERVAL_MS);
  }, 30_000);
}

module.exports = { start };
