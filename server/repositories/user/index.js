const { getDatabaseProvider } = require('../../config/database');
const mongoRepo = require('./mongo');
const postgresRepo = require('./postgres');

function getUserRepository() {
  return getDatabaseProvider() === 'postgres' ? postgresRepo : mongoRepo;
}

module.exports = {
  getUserRepository,
};
