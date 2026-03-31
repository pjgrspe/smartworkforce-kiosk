const postgresRepo = require('./postgres');

function getAttendanceRepository() {
  return postgresRepo;
}

module.exports = {
  getAttendanceRepository,
};
