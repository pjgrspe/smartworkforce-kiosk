const postgres = require('./postgres');
let _repo = null;
function getEmployeeDayOffRepository() {
  if (!_repo) _repo = postgres;
  return _repo;
}
module.exports = { getEmployeeDayOffRepository };
