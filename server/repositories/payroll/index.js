const postgresRepo = require('./postgres');

function getPayrollRepository() {
  return postgresRepo;
}

module.exports = { getPayrollRepository };
