/**
 * Auto-updater for the kiosk-service.
 * Periodically checks the remote git repo for a new release tag.
 * If a newer tag is found, checks it out and restarts via PM2.
 */

const { spawnSync } = require('child_process');

const CHECK_INTERVAL_MS = Number(process.env.UPDATE_CHECK_INTERVAL_MS) || 5 * 60 * 1000; // 5 min default

function run(cmd, opts = {}) {
  return spawnSync(cmd, { shell: true, encoding: 'utf8', cwd: __dirname, ...opts });
}

function isInGitRepo() {
  return run('git rev-parse --is-inside-work-tree').status === 0;
}

function checkAndUpdate() {
  if (!isInGitRepo()) return;

  try {
    // Fetch latest tags from remote
    const fetch = run('git fetch --tags');
    if (fetch.status !== 0) {
      console.log('[updater] git fetch failed — skipping update check');
      return;
    }

    // Latest remote tag
    const latestTag = run('git tag --sort=-version:refname').stdout.trim().split('\n')[0];
    if (!latestTag) {
      console.log('[updater] No tags found — skipping');
      return;
    }

    // Current checked-out tag
    const currentTag = run('git describe --tags --exact-match HEAD').stdout.trim()
      || run('git describe --tags').stdout.trim()
      || '(unknown)';

    if (currentTag === latestTag) {
      console.log(`[updater] Already on latest tag (${latestTag})`);
      return;
    }

    console.log(`[updater] New release detected: ${currentTag} → ${latestTag}. Updating...`);

    const checkout = run(`git checkout ${latestTag}`);
    if (checkout.status !== 0) {
      console.error('[updater] git checkout failed:', checkout.stderr);
      return;
    }

    console.log(`[updater] Updated to ${latestTag} — restarting via PM2...`);
    run('pm2 restart smartworkforce-kiosk --update-env');
  } catch (err) {
    console.error('[updater] Error during update check:', err.message);
  }
}

function start() {
  console.log(`[updater] Started — checking for new release tags every ${CHECK_INTERVAL_MS / 1000}s`);
  // Stagger initial check by 30s so kiosk starts up fully first
  setTimeout(() => {
    checkAndUpdate();
    setInterval(checkAndUpdate, CHECK_INTERVAL_MS);
  }, 30_000);
}

module.exports = { start };
