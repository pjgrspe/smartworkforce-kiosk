const postgresRepo = require('./postgres');

function getSalaryRepository() {
  return postgresRepo;
}

module.exports = { getSalaryRepository };
