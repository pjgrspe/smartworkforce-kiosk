const { getDatabaseProvider } = require('../../config/database');
const mongoRepo = require('./mongo');
const postgresRepo = require('./postgres');

function getSalaryRepository() {
  return getDatabaseProvider() === 'postgres' ? postgresRepo : mongoRepo;
}

module.exports = { getSalaryRepository };