/**
 * Auto-updater for the kiosk-service.
 * Periodically checks the remote git repo for new commits.
 * If behind, pulls the latest and restarts via PM2.
 */

const { execSync, spawnSync } = require('child_process');

const CHECK_INTERVAL_MS = Number(process.env.UPDATE_CHECK_INTERVAL_MS) || 5 * 60 * 1000; // 5 min default

function run(cmd, opts = {}) {
  return spawnSync(cmd, { shell: true, encoding: 'utf8', ...opts });
}

function isInGitRepo() {
  return run('git rev-parse --is-inside-work-tree').status === 0;
}

function checkAndUpdate() {
  if (!isInGitRepo()) return;

  try {
    // Fetch without modifying working tree
    const fetch = run('git fetch origin main');
    if (fetch.status !== 0) {
      console.log('[updater] git fetch failed — skipping update check');
      return;
    }

    const local  = run('git rev-parse HEAD').stdout.trim();
    const remote = run('git rev-parse origin/main').stdout.trim();

    if (local === remote) {
      console.log('[updater] Already up to date');
      return;
    }

    console.log(`[updater] New version detected (${local.slice(0,7)} → ${remote.slice(0,7)}), pulling...`);

    const pull = run('git pull origin main');
    if (pull.status !== 0) {
      console.error('[updater] git pull failed:', pull.stderr);
      return;
    }

    console.log('[updater] Pull successful — restarting via PM2...');
    // Restart ourselves via PM2; PM2 will bring the process back up with the new files
    run('pm2 restart smartworkforce-kiosk');
  } catch (err) {
    console.error('[updater] Error during update check:', err.message);
  }
}

function start() {
  console.log(`[updater] Started — checking for updates every ${CHECK_INTERVAL_MS / 1000}s`);
  // Stagger initial check by 30s so kiosk starts up fully first
  setTimeout(() => {
    checkAndUpdate();
    setInterval(checkAndUpdate, CHECK_INTERVAL_MS);
  }, 30_000);
}

module.exports = { start };
