const postgresRepo = require('./postgres');

function getDepartmentRepository() {
  return postgresRepo;
}

module.exports = { getDepartmentRepository };
