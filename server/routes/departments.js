const express    = require('express');
const router     = express.Router();
const Department = require('../models/Department');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// GET /api/departments?branchId=xxx
router.get('/', async (req, res) => {
  try {
    const filter = { tenantId: req.user.tenantId, isActive: true };
    if (req.user.role !== 'super_admin' && req.user.branchId) {
      filter.branchId = req.user.branchId;
    } else if (req.query.branchId) {
      filter.branchId = req.query.branchId;
    }
    const departments = await Department.find(filter).sort('name').lean();
    return res.json({ data: departments });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/departments
router.post('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.branchId && req.body.branchId !== req.user.branchId) {
      return res.status(403).json({ error: 'You can only manage departments for your assigned branch' });
    }
    const dept = await new Department({ ...req.body, tenantId: req.user.tenantId }).save();
    return res.status(201).json({ data: dept.toObject() });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/departments/:id
router.patch('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.branchId && req.body.branchId && req.body.branchId !== req.user.branchId) {
      return res.status(403).json({ error: 'You can only manage departments for your assigned branch' });
    }
    const dept = await Department.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();
    if (!dept) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: dept });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/departments/:id
router.delete('/:id', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    await Department.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { isActive: false }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
