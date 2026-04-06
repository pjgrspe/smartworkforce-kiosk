const express    = require('express');
const router     = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { getDepartmentRepository } = require('../repositories/department');

router.use(authenticate);

// GET /api/departments?branchId=xxx
router.get('/', async (req, res) => {
  try {
    const repo = getDepartmentRepository();
    const departments = await repo.listDepartments({ user: req.user, branchId: req.query.branchId });
    return res.json({ data: departments });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/departments
router.post('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    if (!['super_admin', 'client_admin'].includes(req.user.role) && req.user.branchId && req.body.branchId !== req.user.branchId) {
      return res.status(403).json({ error: 'You can only manage departments for your assigned branch' });
    }
    const repo = getDepartmentRepository();
    const dept = await repo.createDepartment({ user: req.user, payload: req.body });
    return res.status(201).json({ data: dept });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/departments/:id
router.patch('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    if (!['super_admin', 'client_admin'].includes(req.user.role) && req.user.branchId && req.body.branchId && req.body.branchId !== req.user.branchId) {
      return res.status(403).json({ error: 'You can only manage departments for your assigned branch' });
    }
    const repo = getDepartmentRepository();
    const dept = await repo.updateDepartment({ user: req.user, id: req.params.id, patch: req.body });
    if (!dept) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: dept });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/departments/:id
router.delete('/:id', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const repo = getDepartmentRepository();
    await repo.softDeleteDepartment({ user: req.user, id: req.params.id });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
