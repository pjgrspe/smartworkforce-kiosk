/**
 * PostgreSQL Connection Configuration
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

let pool = null;

async function connectPostgres() {
  const connectionString = process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error('Missing POSTGRES_URL environment variable');
  }

  pool = new Pool({
    connectionString,
    max: parseInt(process.env.POSTGRES_POOL_MAX || '15', 10),
    idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT_MS || '10000', 10),
  });

  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info('Connected to PostgreSQL');
  } finally {
    client.release();
  }

  pool.on('error', (err) => {
    logger.error('PostgreSQL pool error:', err.message);
  });
}

function getPool() {
  if (!pool) {
    throw new Error('PostgreSQL is not initialized. Call connectPostgres() first.');
  }
  return pool;
}

async function checkConnection() {
  if (!pool) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function closePostgres() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  connectPostgres,
  getPool,
  checkConnection,
  closePostgres,
};
