const postgresRepo = require('./postgres');

function getScheduleRepository() {
  return postgresRepo;
}

module.exports = { getScheduleRepository };
