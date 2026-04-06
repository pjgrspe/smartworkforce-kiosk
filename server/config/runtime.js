/**
 * Runtime mode configuration for deployment topology.
 * - CENTRAL: cloud server mode
 * - BRANCH: local branch edge mode
 */

const SUPPORTED_RUNTIME_MODES = ['CENTRAL', 'BRANCH'];

function getRuntimeMode() {
  const mode = String(process.env.APP_RUNTIME_MODE || 'CENTRAL').toUpperCase();
  return SUPPORTED_RUNTIME_MODES.includes(mode) ? mode : 'CENTRAL';
}

module.exports = {
  getRuntimeMode,
};
