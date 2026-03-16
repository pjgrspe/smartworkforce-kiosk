/**
 * Unified Database Bootstrap
 * DB_PROVIDER determines active backend during migration:
 * - mongo (default)
 * - postgres
 */

const logger = require('../utils/logger');
const { connectMongoDB } = require('./mongodb');
const { connectPostgres, checkConnection: checkPostgresConnection } = require('./postgres');
const { checkConnection: checkMongoConnection } = require('./mongodb');

const DB_PROVIDER = String(process.env.DB_PROVIDER || 'mongo').toLowerCase();

async function connectDatabase() {
  if (DB_PROVIDER === 'postgres') {
    await connectPostgres();
    logger.info('Database provider active: postgres');
    return { provider: 'postgres' };
  }

  await connectMongoDB();
  logger.info('Database provider active: mongo');
  return { provider: 'mongo' };
}

function getDatabaseProvider() {
  return DB_PROVIDER;
}

async function checkDatabaseConnection() {
  if (DB_PROVIDER === 'postgres') {
    return checkPostgresConnection();
  }

  return checkMongoConnection();
}

module.exports = {
  connectDatabase,
  getDatabaseProvider,
  checkDatabaseConnection,
};
