const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { getBranchRepository } = require('../repositories/branch');

router.use(authenticate);

// GET /api/branches
router.get('/', async (req, res) => {
  try {
    const repo = getBranchRepository();
    // super_admin can pass ?tenantId= to fetch branches for a specific tenant
    // (used by the user-management modal when assigning a user to a different tenant)
    const user = { ...req.user };
    if (req.user.role === 'super_admin' && req.query.tenantId) {
      user.tenantId = req.query.tenantId;
    }
    const branches = await repo.listBranches({ user });
    return res.json({ data: branches });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/branches
router.post('/', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const repo = getBranchRepository();
    const branch = await repo.createBranch({ user: req.user, payload: req.body });
    return res.status(201).json({ data: branch });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/branches/:id
router.patch('/:id', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const repo = getBranchRepository();
    const branch = await repo.updateBranch({ user: req.user, id: req.params.id, patch: req.body });
    if (!branch) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: branch });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/branches/:id  (soft delete)
router.delete('/:id', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const repo = getBranchRepository();
    await repo.softDeleteBranch({ user: req.user, id: req.params.id });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
