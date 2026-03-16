const express         = require('express');
const router          = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { getSalaryRepository } = require('../repositories/salary');

function normalizeSalaryPayload(payload) {
  const next = { ...payload };
  if (Object.prototype.hasOwnProperty.call(next, 'isOvertimeEligible') && !Object.prototype.hasOwnProperty.call(next, 'overtimeEligible')) {
    next.overtimeEligible = next.isOvertimeEligible;
  }
  if (Object.prototype.hasOwnProperty.call(next, 'isNightDiffEligible') && !Object.prototype.hasOwnProperty.call(next, 'nightDiffEligible')) {
    next.nightDiffEligible = next.isNightDiffEligible;
  }
  delete next.isOvertimeEligible;
  delete next.isNightDiffEligible;
  delete next.tenantId;
  return next;
}

router.use(authenticate);

// GET /api/salary — active/current salary structures for current tenant
router.get('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const repo = getSalaryRepository();
    const records = await repo.listActiveSalaryStructures({ user: req.user });
    return res.json({ data: records });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/salary/:employeeId — salary history for one employee
router.get('/:employeeId', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const repo = getSalaryRepository();
    const records = await repo.getSalaryHistory({ user: req.user, employeeId: req.params.employeeId });
    return res.json({ data: records });
  } catch (err) {
    return res.status(err.message === 'Employee not found for current tenant' ? 404 : 500).json({ error: err.message });
  }
});

// POST /api/salary — create new salary structure (deactivates previous)
router.post('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const payload = normalizeSalaryPayload(req.body);
    const repo = getSalaryRepository();
    const salary = await repo.createSalaryStructure({ user: req.user, payload });
    return res.status(201).json({ data: salary });
  } catch (err) {
    return res.status(err.message === 'Employee not found for current tenant' ? 404 : 400).json({ error: err.message });
  }
});

// PATCH /api/salary/:id
router.patch('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const patch = normalizeSalaryPayload(req.body);
    const repo = getSalaryRepository();
    const salary = await repo.updateSalaryStructure({ user: req.user, id: req.params.id, patch });
    if (!salary) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: salary });
  } catch (err) {
    return res.status(err.message === 'Employee not found for current tenant' ? 404 : 400).json({ error: err.message });
  }
});

module.exports = router;
