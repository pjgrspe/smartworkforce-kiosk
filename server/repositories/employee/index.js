const postgresRepo = require('./postgres');

function getEmployeeRepository() {
  return postgresRepo;
}

module.exports = {
  getEmployeeRepository,
};
