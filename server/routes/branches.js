const express = require('express');
const router  = express.Router();
const Branch  = require('../models/Branch');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// GET /api/branches
router.get('/', async (req, res) => {
  try {
    const branches = await Branch.find({ tenantId: req.user.tenantId, isActive: true })
      .sort('name').lean();
    return res.json({ data: branches });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/branches
router.post('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const branch = await new Branch({ ...req.body, tenantId: req.user.tenantId }).save();
    return res.status(201).json({ data: branch.toObject() });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/branches/:id
router.patch('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const branch = await Branch.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();
    if (!branch) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: branch });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/branches/:id  (soft delete)
router.delete('/:id', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    await Branch.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      { isActive: false }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
