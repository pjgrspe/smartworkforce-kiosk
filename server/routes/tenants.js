const express = require('express');
const router  = express.Router();
const Tenant  = require('../models/Tenant');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// GET /api/tenants — super_admin: all tenants; other: filtered
router.get('/', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const filter = req.user.role === 'super_admin' ? {} : { _id: req.user.tenantId };
    const tenants = await Tenant.find(filter).sort('name').lean();
    return res.json({ data: tenants });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/tenants/current — any authenticated user can read own tenant config
router.get('/current', async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.user.tenantId).lean();
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    return res.json({ data: tenant });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/tenants — super_admin only
router.post('/', authorize('super_admin'), async (req, res) => {
  try {
    const tenant = await new Tenant(req.body).save();
    return res.status(201).json({ data: tenant.toObject() });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/tenants/current — update own tenant settings
router.patch('/current', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const tenant = await Tenant.findByIdAndUpdate(
      req.user.tenantId,
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    return res.json({ data: tenant });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/tenants/:id — super_admin only
router.patch('/:id', authorize('super_admin'), async (req, res) => {
  try {
    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();
    if (!tenant) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: tenant });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
