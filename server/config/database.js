/**
 * Unified Database Bootstrap
 * PostgreSQL-only backend.
 */

const logger = require('../utils/logger');
const { connectPostgres, checkConnection: checkPostgresConnection } = require('./postgres');

async function connectDatabase() {
  await connectPostgres();
  logger.info('Database provider active: postgres');
  return { provider: 'postgres' };
}

function getDatabaseProvider() {
  return 'postgres';
}

async function checkDatabaseConnection() {
  return checkPostgresConnection();
}

module.exports = {
  connectDatabase,
  getDatabaseProvider,
  checkDatabaseConnection,
};
