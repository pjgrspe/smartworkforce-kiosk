const Holiday = require('../../models/Holiday');

function mapHoliday(row) {
  if (!row) return null;
  return {
    ...row,
    _id: row._id,
    id: row._id,
  };
}

async function listHolidays({ user, year }) {
  const filter = { tenantId: user.tenantId };
  if (year) {
    filter.date = { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) };
  }
  const rows = await Holiday.find(filter).sort('date').lean();
  return rows.map(mapHoliday);
}

async function createHoliday({ user, payload }) {
  const row = await new Holiday({ ...payload, tenantId: user.tenantId }).save();
  return mapHoliday(row.toObject());
}

async function bulkCreateHolidays({ user, holidays }) {
  const docs = (holidays || []).map((holiday) => ({ ...holiday, tenantId: user.tenantId }));
  const rows = await Holiday.insertMany(docs, { ordered: false });
  return rows.map((row) => mapHoliday(row.toObject()));
}

async function deleteHoliday({ user, id }) {
  await Holiday.findOneAndDelete({ _id: id, tenantId: user.tenantId });
  return true;
}

async function listForRange({ tenantId, startDate, endDate }) {
  const rows = await Holiday.find({ tenantId, date: { $gte: startDate, $lte: endDate } }).lean();
  return rows.map(mapHoliday);
}

module.exports = {
  listHolidays,
  createHoliday,
  bulkCreateHolidays,
  deleteHoliday,
  listForRange,
};