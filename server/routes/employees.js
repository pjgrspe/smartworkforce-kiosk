/**
 * Employee Routes
 */

const express   = require('express');
const router    = express.Router();
const Employee  = require('../models/Employee');
const { authenticate, authorize } = require('../middleware/auth');
const logger    = require('../utils/logger');

// All employee routes require authentication
router.use(authenticate);

// GET /api/employees — list active employees for current tenant
router.get('/', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const filter = { tenantId, isActive: true };
    if (req.user.role === 'branch_manager' && req.user.branchId) {
      filter.branchId = req.user.branchId;
    }

    const employees = await Employee.find(filter)
      .select('-faceData.encodings -faceData.reEnrollmentHistory')
      .sort('lastName')
      .lean();

    return res.json({ data: employees });
  } catch (err) {
    logger.error('GET /employees:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  try {
    const emp = await Employee.findById(req.params.id).lean();
    if (!emp || emp.tenantId.toString() !== req.user.tenantId) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json({ data: emp });
  } catch (err) {
    logger.error('GET /employees/:id:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/employees — HR/client_admin/super_admin only
router.post('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const payload = { ...req.body, tenantId: req.user.tenantId, createdBy: req.user.sub };

    const emp = await new Employee(payload).save();
    logger.info(`Employee created: ${emp._id}`);
    return res.status(201).json({ data: emp.toObject() });
  } catch (err) {
    logger.error('POST /employees:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/employees/:id
router.patch('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const emp = await Employee.findById(req.params.id);
    if (!emp || emp.tenantId.toString() !== req.user.tenantId) {
      return res.status(404).json({ error: 'Not found' });
    }

    const updated = await Employee.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();

    return res.json({ data: updated });
  } catch (err) {
    logger.error('PATCH /employees/:id:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/employees/:id/enroll-face — save face-api.js descriptors from browser kiosk enrollment
router.patch('/:id/enroll-face', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const { descriptors } = req.body;  // Array of Float32Array-compatible number arrays
    if (!Array.isArray(descriptors) || descriptors.length < 1) {
      return res.status(400).json({ error: 'descriptors array required (min 1)' });
    }

    const emp = await Employee.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId },
      {
        $set: {
          'faceData.faceApiDescriptors': descriptors,
          'faceData.enrollmentDate': new Date(),
          'faceData.enrollmentBranchId': req.user.branchId || null,
        },
        $push: {
          'faceData.reEnrollmentHistory': {
            enrolledAt: new Date(),
            enrolledBy: req.user._id,
            note: `Browser enrollment — ${descriptors.length} sample(s)`
          }
        }
      },
      { new: true, runValidators: false }
    ).lean();

    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    return res.json({ data: emp });
  } catch (err) {
    logger.error('PATCH /employees/:id/enroll-face:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/employees/:id  (soft-delete)
router.delete('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const emp = await Employee.findById(req.params.id);
    if (!emp || emp.tenantId.toString() !== req.user.tenantId) {
      return res.status(404).json({ error: 'Not found' });
    }

    await Employee.findByIdAndUpdate(req.params.id, {
      $set: { isActive: false, 'employment.status': 'inactive' }
    });

    return res.json({ message: 'Employee deactivated' });
  } catch (err) {
    logger.error('DELETE /employees/:id:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
