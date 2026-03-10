const express = require('express');
const router  = express.Router();
const Holiday = require('../models/Holiday');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// GET /api/holidays?year=2025
router.get('/', async (req, res) => {
  try {
    const filter = { tenantId: req.user.tenantId };
    if (req.query.year) {
      const y = parseInt(req.query.year);
      filter.date = { $gte: new Date(`${y}-01-01`), $lte: new Date(`${y}-12-31`) };
    }
    const holidays = await Holiday.find(filter).sort('date').lean();
    return res.json({ data: holidays });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/holidays
router.post('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const holiday = await new Holiday({ ...req.body, tenantId: req.user.tenantId }).save();
    return res.status(201).json({ data: holiday.toObject() });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/holidays/bulk — seed a list of holidays at once
router.post('/bulk', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const docs = (req.body.holidays || []).map(h => ({ ...h, tenantId: req.user.tenantId }));
    const result = await Holiday.insertMany(docs, { ordered: false });
    return res.status(201).json({ data: result, count: result.length });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/holidays/:id
router.delete('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    await Holiday.findOneAndDelete({ _id: req.params.id, tenantId: req.user.tenantId });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
