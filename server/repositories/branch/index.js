const postgresRepo = require('./postgres');

function getBranchRepository() {
  return postgresRepo;
}

module.exports = { getBranchRepository };
