/**
 * MongoDB Connection Configuration
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

async function connectMongoDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('Missing MONGODB_URI environment variable');
  }

  await mongoose.connect(uri, { autoIndex: true });
  logger.info('✅ Connected to MongoDB');

  mongoose.connection.on('disconnected', () => {
    logger.warn('❌ MongoDB disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('✅ MongoDB reconnected');
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB error:', err.message);
  });
}

async function checkConnection() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectMongoDB, checkConnection };
