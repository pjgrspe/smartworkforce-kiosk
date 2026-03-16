const { getDatabaseProvider } = require('../../config/database');
const mongoRepo = require('./mongo');
const postgresRepo = require('./postgres');

function getCorrectionRepository() {
  return getDatabaseProvider() === 'postgres' ? postgresRepo : mongoRepo;
}

module.exports = { getCorrectionRepository };