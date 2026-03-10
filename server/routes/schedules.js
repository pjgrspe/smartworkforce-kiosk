const express  = require('express');
const router   = express.Router();
const Schedule = require('../models/Schedule');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// GET /api/schedules
router.get('/', async (req, res) => {
  try {
    const schedules = await Schedule.find({ tenantId: req.user.tenantId, isActive: true })
      .sort('name').lean();
    return res.json({ data: schedules });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/schedules
router.post('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const schedule = await new Schedule({ ...req.body, tenantId: req.user.tenantId }).save();
    return res.status(201).json({ data: schedule.toObject() });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/schedules/:id
router.patch('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const schedule = await Schedule.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: schedule });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/schedules/:id
router.delete('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    await Schedule.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { isActive: false }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
