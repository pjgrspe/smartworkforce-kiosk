const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { getHolidayRepository } = require('../repositories/holiday');

router.use(authenticate);

// GET /api/holidays?year=2025&branchId=xxx
router.get('/', async (req, res) => {
  try {
    const repo = getHolidayRepository();
    const year     = req.query.year ? parseInt(req.query.year, 10) : undefined;
    const branchId = req.query.branchId || undefined;
    const holidays = await repo.listHolidays({ user: req.user, year: Number.isNaN(year) ? undefined : year, branchId });
    return res.json({ data: holidays });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/holidays
router.post('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const repo = getHolidayRepository();
    const holiday = await repo.createHoliday({ user: req.user, payload: req.body });
    return res.status(201).json({ data: holiday });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/holidays/bulk — seed a list of holidays at once
router.post('/bulk', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const repo = getHolidayRepository();
    const result = await repo.bulkCreateHolidays({
      user:     req.user,
      holidays: req.body.holidays || [],
      branchId: req.body.branchId || null,
    });
    return res.status(201).json({ data: result, count: result.length });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/holidays/:id
router.delete('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const repo = getHolidayRepository();
    await repo.deleteHoliday({ user: req.user, id: req.params.id });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
