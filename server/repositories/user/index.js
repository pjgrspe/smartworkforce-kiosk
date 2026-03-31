const postgresRepo = require('./postgres');

function getUserRepository() {
  return postgresRepo;
}

module.exports = {
  getUserRepository,
};
