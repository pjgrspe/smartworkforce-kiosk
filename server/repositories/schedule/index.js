const { getDatabaseProvider } = require('../../config/database');
const mongoRepo = require('./mongo');
const postgresRepo = require('./postgres');

function getScheduleRepository() {
  return getDatabaseProvider() === 'postgres' ? postgresRepo : mongoRepo;
}

module.exports = { getScheduleRepository };
