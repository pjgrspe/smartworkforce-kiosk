const postgresRepo = require('./postgres');

function getTenantRepository() {
  return postgresRepo;
}

module.exports = { getTenantRepository };
