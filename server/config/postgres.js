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
    min:                    parseInt(process.env.POSTGRES_POOL_MIN          || '2',     10),
    max:                    parseInt(process.env.POSTGRES_POOL_MAX          || '20',    10),
    idleTimeoutMillis:      parseInt(process.env.POSTGRES_IDLE_TIMEOUT_MS   || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONN_TIMEOUT_MS  || '5000',  10),
    statement_timeout:      parseInt(process.env.POSTGRES_STATEMENT_TIMEOUT || '30000', 10),
  });

  // Verify connectivity with retry on startup
  let lastErr;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        logger.info('Connected to PostgreSQL');
        lastErr = null;
      } finally {
        client.release();
      }
      break;
    } catch (err) {
      lastErr = err;
      const delay = attempt * 1000;
      logger.warn(`PostgreSQL connection attempt ${attempt}/5 failed: ${err.message}. Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  if (lastErr) throw lastErr;

  pool.on('error', (err) => {
    logger.error(`PostgreSQL pool error: ${err.message}`);
  });

  pool.on('connect', () => {
    logger.debug('PostgreSQL pool: new client connected');
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
