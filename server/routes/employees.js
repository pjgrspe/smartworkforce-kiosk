/**
 * Employee Routes
 */

const express   = require('express');
const router    = express.Router();
const Employee  = require('../models/Employee');
const Branch    = require('../models/Branch');
const Department = require('../models/Department');
const Schedule  = require('../models/Schedule');
const { authenticate, authorize } = require('../middleware/auth');
const logger    = require('../utils/logger');

function getDuplicateEmployeeMessage(employeeCode) {
  return `Employee code "${employeeCode}" is already in use.`;
}

function getArchivedEmployeeCode(employeeCode) {
  return `${employeeCode}__archived__${Date.now().toString(36)}`;
}

async function releaseInactiveEmployeeCodeReservation(tenantId, employeeCode) {
  if (!employeeCode) return;

  const inactiveEmployee = await Employee.findOne({
    tenantId,
    employeeCode,
    isActive: false,
  }).select('_id employeeCode email').lean();

  if (!inactiveEmployee) return;

  const archivedSuffix = Date.now().toString(36);
  await Employee.findByIdAndUpdate(inactiveEmployee._id, {
    $set: {
      employeeCode: getArchivedEmployeeCode(inactiveEmployee.employeeCode),
      ...(inactiveEmployee.email ? { email: `${inactiveEmployee.email}.archived.${archivedSuffix}` } : {}),
    }
  });
}

async function ensureEmployeeCodeAvailable(tenantId, employeeCode, currentEmployeeId = null) {
  if (!employeeCode) return;

  const existingEmployee = await Employee.findOne({
    tenantId,
    employeeCode,
    ...(currentEmployeeId ? { _id: { $ne: currentEmployeeId } } : {}),
  }).select('_id isActive').lean();

  if (!existingEmployee) return;

  if (existingEmployee.isActive) {
    throw new Error(getDuplicateEmployeeMessage(employeeCode));
  }

  await releaseInactiveEmployeeCodeReservation(tenantId, employeeCode);
}

function formatEmployeeRouteError(err, employeeCode) {
  if (err?.code === 11000 && (err?.keyPattern?.employeeCode || err?.keyValue?.employeeCode)) {
    return getDuplicateEmployeeMessage(employeeCode || err?.keyValue?.employeeCode || '');
  }

  return err.message;
}

function normalizeEmployeePayload(payload) {
  const next = { ...payload };
  if (typeof next.email === 'string') next.email = next.email.toLowerCase().trim();
  if (typeof next.employeeCode === 'string') next.employeeCode = next.employeeCode.trim();
  return next;
}

async function validateEmployeeRelations(payload, tenantId) {
  if (!payload.branchId) {
    throw new Error('branchId is required');
  }

  const branch = await Branch.findOne({ _id: payload.branchId, tenantId }).select('_id').lean();
  if (!branch) {
    throw new Error('Invalid branch for current tenant');
  }

  if (payload.departmentId) {
    const department = await Department.findOne({ _id: payload.departmentId, tenantId }).select('_id').lean();
    if (!department) throw new Error('Invalid department for current tenant');
  }

  if (payload.scheduleId) {
    const schedule = await Schedule.findOne({ _id: payload.scheduleId, tenantId }).select('_id').lean();
    if (!schedule) throw new Error('Invalid schedule for current tenant');
  }
}

function validateBranchScope(payload, user) {
  if (user.role !== 'super_admin' && user.branchId && payload.branchId !== user.branchId) {
    throw new Error('You can only manage employees for your assigned branch');
  }
}

function validateDescriptors(descriptors) {
  if (!Array.isArray(descriptors) || descriptors.length < 1 || descriptors.length > 5) {
    throw new Error('descriptors array required (min 1, max 5)');
  }

  for (const descriptor of descriptors) {
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      throw new Error('Each face descriptor must contain exactly 128 numeric values');
    }
    if (descriptor.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error('Face descriptors must contain only finite numeric values');
    }
  }
}

// All employee routes require authentication
router.use(authenticate);

// GET /api/employees/me — current authenticated employee profile
router.get('/me', async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.status(404).json({ error: 'No employee profile is linked to this account' });
    }

    const emp = await Employee.findOne({
      _id: req.user.employeeId,
      tenantId: req.user.tenantId,
      isActive: true,
    })
      .select('-faceData.encodings -faceData.reEnrollmentHistory')
      .populate('branchId', 'name code')
      .lean();

    if (!emp) {
      return res.status(404).json({ error: 'Employee profile not found' });
    }

    return res.json({ data: emp });
  } catch (err) {
    logger.error('GET /employees/me:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/employees — list active employees for current tenant
router.get('/', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const filter = { tenantId, isActive: true };
    if (req.user.role !== 'super_admin' && req.user.branchId) {
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
    const filter = { _id: req.params.id, tenantId: req.user.tenantId };
    if (req.user.role !== 'super_admin' && req.user.branchId) {
      filter.branchId = req.user.branchId;
    }

    const emp = await Employee.findOne(filter).lean();
    if (!emp) {
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
    const payload = normalizeEmployeePayload({ ...req.body, tenantId: req.user.tenantId, createdBy: req.user.sub });
    validateBranchScope(payload, req.user);
    await validateEmployeeRelations(payload, req.user.tenantId);
    await ensureEmployeeCodeAvailable(req.user.tenantId, payload.employeeCode);

    const emp = await new Employee(payload).save();
    logger.info(`Employee created: ${emp._id}`);
    return res.status(201).json({ data: emp.toObject() });
  } catch (err) {
    logger.error('POST /employees:', err.message);
    return res.status(400).json({ error: formatEmployeeRouteError(err, req.body.employeeCode) });
  }
});

// PATCH /api/employees/:id
router.patch('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const emp = await Employee.findById(req.params.id);
    if (!emp || emp.tenantId.toString() !== req.user.tenantId) {
      return res.status(404).json({ error: 'Not found' });
    }

    const patch = normalizeEmployeePayload({ ...req.body });
    delete patch.tenantId;
    delete patch.createdBy;

    if (patch.employeeCode && patch.employeeCode !== emp.employeeCode) {
      await ensureEmployeeCodeAvailable(req.user.tenantId, patch.employeeCode, emp._id);
    }

    const nextRelations = {
      branchId: patch.branchId || emp.branchId,
      departmentId: Object.prototype.hasOwnProperty.call(patch, 'departmentId') ? patch.departmentId : emp.departmentId,
      scheduleId: Object.prototype.hasOwnProperty.call(patch, 'scheduleId') ? patch.scheduleId : emp.scheduleId,
    };

    validateBranchScope(nextRelations, req.user);
    await validateEmployeeRelations(nextRelations, req.user.tenantId);

    const updated = await Employee.findByIdAndUpdate(
      req.params.id,
      { $set: patch },
      { new: true, runValidators: true }
    ).lean();

    return res.json({ data: updated });
  } catch (err) {
    logger.error('PATCH /employees/:id:', err.message);
    return res.status(400).json({ error: formatEmployeeRouteError(err, req.body.employeeCode) });
  }
});

// PATCH /api/employees/:id/enroll-face — save face-api.js descriptors from browser kiosk enrollment
router.patch('/:id/enroll-face', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const { descriptors } = req.body;  // Array of Float32Array-compatible number arrays
    validateDescriptors(descriptors);

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
            enrolledBy: req.user.sub,
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
      $set: {
        isActive: false,
        employeeCode: getArchivedEmployeeCode(emp.employeeCode),
        ...(emp.email ? { email: `${emp.email}.archived.${Date.now().toString(36)}` } : {}),
        'employment.status': 'inactive'
      }
    });

    return res.json({ message: 'Employee deactivated' });
  } catch (err) {
    logger.error('DELETE /employees/:id:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
