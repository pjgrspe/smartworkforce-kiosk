const postgresRepo = require('./postgres');

function getHolidayRepository() {
  return postgresRepo;
}

module.exports = { getHolidayRepository };
