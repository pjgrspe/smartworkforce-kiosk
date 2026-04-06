const postgres = require('./postgres');

let _repo = null;

function getLeaveRepository() {
  if (!_repo) _repo = postgres;
  return _repo;
}

module.exports = { getLeaveRepository };
