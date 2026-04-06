const express  = require('express');
const router   = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { getScheduleRepository } = require('../repositories/schedule');

router.use(authenticate);

// GET /api/schedules
router.get('/', async (req, res) => {
  try {
    const repo = getScheduleRepository();
    const schedules = await repo.listSchedules({ user: req.user });
    return res.json({ data: schedules });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/schedules
router.post('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const repo = getScheduleRepository();
    const schedule = await repo.createSchedule({ user: req.user, payload: req.body });
    return res.status(201).json({ data: schedule });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/schedules/:id
router.patch('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const repo = getScheduleRepository();
    const schedule = await repo.updateSchedule({ user: req.user, id: req.params.id, patch: req.body });
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: schedule });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/schedules/:id
router.delete('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const repo = getScheduleRepository();
    await repo.softDeleteSchedule({ user: req.user, id: req.params.id });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
