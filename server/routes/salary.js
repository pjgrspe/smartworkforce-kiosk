const express         = require('express');
const router          = express.Router();
const SalaryStructure = require('../models/SalaryStructure');
const Employee        = require('../models/Employee');
const { authenticate, authorize } = require('../middleware/auth');

async function ensureEmployeeBelongsToTenant(employeeId, tenantId) {
  const employee = await Employee.findOne({ _id: employeeId, tenantId, isActive: true }).select('_id').lean();
  if (!employee) {
    throw new Error('Employee not found for current tenant');
  }
}

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
    const records = await SalaryStructure.find({ tenantId: req.user.tenantId, isActive: true })
      .populate('employeeId', 'firstName lastName employeeCode branchId employment.position')
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();
    return res.json({ data: records });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/salary/:employeeId — salary history for one employee
router.get('/:employeeId', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    await ensureEmployeeBelongsToTenant(req.params.employeeId, req.user.tenantId);

    const records = await SalaryStructure.find({ employeeId: req.params.employeeId, tenantId: req.user.tenantId })
      .sort('-effectiveDate').lean();
    return res.json({ data: records });
  } catch (err) {
    return res.status(err.message === 'Employee not found for current tenant' ? 404 : 500).json({ error: err.message });
  }
});

// POST /api/salary — create new salary structure (deactivates previous)
router.post('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const payload = normalizeSalaryPayload(req.body);
    await ensureEmployeeBelongsToTenant(payload.employeeId, req.user.tenantId);

    // Deactivate any existing active structure for this employee
    await SalaryStructure.updateMany(
      { employeeId: payload.employeeId, tenantId: req.user.tenantId, isActive: true },
      { isActive: false }
    );
    const salary = await new SalaryStructure({
      ...payload,
      tenantId: req.user.tenantId
    }).save();
    return res.status(201).json({ data: salary.toObject() });
  } catch (err) {
    return res.status(err.message === 'Employee not found for current tenant' ? 404 : 400).json({ error: err.message });
  }
});

// PATCH /api/salary/:id
router.patch('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const patch = normalizeSalaryPayload(req.body);
    if (patch.employeeId) {
      await ensureEmployeeBelongsToTenant(patch.employeeId, req.user.tenantId);
    }

    const salary = await SalaryStructure.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { $set: patch },
      { new: true, runValidators: true }
    ).lean();
    if (!salary) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: salary });
  } catch (err) {
    return res.status(err.message === 'Employee not found for current tenant' ? 404 : 400).json({ error: err.message });
  }
});

module.exports = router;
