const postgresRepo = require('./postgres');

function getKioskRepository() {
  return postgresRepo;
}

module.exports = { getKioskRepository };
