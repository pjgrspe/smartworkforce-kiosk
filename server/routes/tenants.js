const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { getTenantRepository } = require('../repositories/tenant');

router.use(authenticate);

// GET /api/tenants — super_admin: all tenants; other: filtered
router.get('/', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const repo = getTenantRepository();
    const tenants = await repo.listTenants({ user: req.user });
    return res.json({ data: tenants });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/tenants/current — any authenticated user can read own tenant config
router.get('/current', async (req, res) => {
  try {
    const repo = getTenantRepository();
    const tenant = await repo.findById(req.user.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    return res.json({ data: tenant });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/tenants — super_admin only
router.post('/', authorize('super_admin'), async (req, res) => {
  try {
    const repo = getTenantRepository();
    const tenant = await repo.createTenant(req.body);
    return res.status(201).json({ data: tenant });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/tenants/current — update own tenant settings
router.patch('/current', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const repo = getTenantRepository();
    const tenant = await repo.updateTenant(req.user.tenantId, req.body);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    return res.json({ data: tenant });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/tenants/:id — super_admin only
router.patch('/:id', authorize('super_admin'), async (req, res) => {
  try {
    const repo = getTenantRepository();
    const tenant = await repo.updateTenant(req.params.id, req.body);
    if (!tenant) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: tenant });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
