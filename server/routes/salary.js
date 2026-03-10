const express         = require('express');
const router          = express.Router();
const SalaryStructure = require('../models/SalaryStructure');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// GET /api/salary/:employeeId — salary history for one employee
router.get('/:employeeId', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const records = await SalaryStructure.find({ employeeId: req.params.employeeId })
      .sort('-effectiveDate').lean();
    return res.json({ data: records });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/salary — create new salary structure (deactivates previous)
router.post('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    // Deactivate any existing active structure for this employee
    await SalaryStructure.updateMany(
      { employeeId: req.body.employeeId, isActive: true },
      { isActive: false }
    );
    const salary = await new SalaryStructure({
      ...req.body,
      tenantId: req.user.tenantId
    }).save();
    return res.status(201).json({ data: salary.toObject() });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/salary/:id
router.patch('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const salary = await SalaryStructure.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();
    if (!salary) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: salary });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
