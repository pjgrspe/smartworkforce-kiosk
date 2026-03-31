const postgresRepo = require('./postgres');

function getCorrectionRepository() {
  return postgresRepo;
}

module.exports = { getCorrectionRepository };
