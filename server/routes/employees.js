/**
 * Employee Routes
 */

const express   = require('express');
const router    = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const logger    = require('../utils/logger');
const { getEmployeeRepository } = require('../repositories/employee');
const { getEmployeeDayOffRepository } = require('../repositories/employee-day-off');
const { writeAuditLog } = require('../services/audit');

function getDuplicateEmployeeMessage(employeeCode) {
  return `Employee code "${employeeCode}" is already in use.`;
}

function formatEmployeeRouteError(err, employeeCode) {
  if (err?.code === 'NOT_IMPLEMENTED') {
    return err.message;
  }

  if (err?.code === 'DUPLICATE_EMPLOYEE_CODE') {
    return getDuplicateEmployeeMessage(employeeCode || '');
  }

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

function validateBranchScope(payload, user) {
  // Tenant isolation — no role may write to a different tenant
  if (payload.tenantId && user.tenantId && payload.tenantId !== user.tenantId) {
    throw new Error('Cross-tenant employee management is not permitted');
  }
  // Branch isolation — only super_admin and client_admin may manage any branch within their tenant
  const crossBranchRoles = ['super_admin', 'client_admin'];
  if (!crossBranchRoles.includes(user.role) && user.branchId && payload.branchId !== user.branchId) {
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

    const employeeRepo = getEmployeeRepository();
    const emp = await employeeRepo.getProfile({ user: req.user });

    if (!emp) {
      return res.status(404).json({ error: 'Employee profile not found' });
    }

    return res.json({ data: emp });
  } catch (err) {
    logger.error('GET /employees/me:', err.message);
    return res.status(err?.code === 'NOT_IMPLEMENTED' ? 501 : 500).json({ error: err.message });
  }
});

// GET /api/employees — list active employees for current tenant
router.get('/', async (req, res) => {
  try {
    const employeeRepo = getEmployeeRepository();
    const employees = await employeeRepo.listActive({ user: req.user });

    return res.json({ data: employees });
  } catch (err) {
    logger.error('GET /employees:', err.message);
    return res.status(err?.code === 'NOT_IMPLEMENTED' ? 501 : 500).json({ error: err.message });
  }
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  try {
    const employeeRepo = getEmployeeRepository();
    const emp = await employeeRepo.getById({ user: req.user, id: req.params.id });
    if (!emp) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json({ data: emp });
  } catch (err) {
    logger.error('GET /employees/:id:', err.message);
    return res.status(err?.code === 'NOT_IMPLEMENTED' ? 501 : 500).json({ error: err.message });
  }
});

// POST /api/employees — HR/client_admin/super_admin only
router.post('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const employeeRepo = getEmployeeRepository();
    const payload = normalizeEmployeePayload({ ...req.body, tenantId: req.user.tenantId, createdBy: req.user.sub });
    validateBranchScope(payload, req.user);

    const emp = await employeeRepo.createEmployee({ user: req.user, payload });
    logger.info(`Employee created: ${emp._id || emp.id}`);
    writeAuditLog({ tableName: 'employees', recordId: emp._id || emp.id, operation: 'INSERT', changedBy: req.user.sub, afterData: emp, ipAddress: req.ip });
    return res.status(201).json({ data: emp });
  } catch (err) {
    logger.error('POST /employees:', err.message);
    const status = err?.code === 'NOT_IMPLEMENTED' ? 501 : 400;
    return res.status(status).json({ error: formatEmployeeRouteError(err, req.body.employeeCode) });
  }
});

// PATCH /api/employees/:id
router.patch('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const employeeRepo = getEmployeeRepository();
    const existing = await employeeRepo.getById({ user: req.user, id: req.params.id });
    if (!existing) {
      return res.status(404).json({ error: 'Not found' });
    }

    const patch = normalizeEmployeePayload({ ...req.body });
    delete patch.tenantId;
    delete patch.createdBy;

    const nextRelations = {
      branchId: patch.branchId || existing.branchId,
      departmentId: Object.prototype.hasOwnProperty.call(patch, 'departmentId') ? patch.departmentId : existing.departmentId,
      scheduleId: Object.prototype.hasOwnProperty.call(patch, 'scheduleId') ? patch.scheduleId : existing.scheduleId,
    };

    validateBranchScope(nextRelations, req.user);
    const updated = await employeeRepo.updateEmployee({ user: req.user, id: req.params.id, patch });
    writeAuditLog({ tableName: 'employees', recordId: req.params.id, operation: 'UPDATE', changedBy: req.user.sub, beforeData: existing, afterData: updated, ipAddress: req.ip });
    return res.json({ data: updated });
  } catch (err) {
    logger.error('PATCH /employees/:id:', err.message);
    const status = err?.code === 'NOT_IMPLEMENTED' ? 501 : 400;
    return res.status(status).json({ error: formatEmployeeRouteError(err, req.body.employeeCode) });
  }
});

// PATCH /api/employees/:id/enroll-face — save face-api.js descriptors from browser kiosk enrollment
router.patch('/:id/enroll-face', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const employeeRepo = getEmployeeRepository();
    const { descriptors } = req.body;  // Array of Float32Array-compatible number arrays
    validateDescriptors(descriptors);

    const emp = await employeeRepo.enrollFace({
      user: req.user,
      id: req.params.id,
      descriptors,
    });

    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    writeAuditLog({ tableName: 'employees', recordId: req.params.id, operation: 'UPDATE', changedBy: req.user.sub, notes: 'face enrollment', ipAddress: req.ip });
    return res.json({ data: emp });
  } catch (err) {
    logger.error('PATCH /employees/:id/enroll-face:', err.message);
    const status = err?.code === 'NOT_IMPLEMENTED' ? 501 : 400;
    return res.status(status).json({ error: err.message });
  }
});

// POST /api/employees/:id/documents — upload an attachment (base64 in JSON body)
router.post('/:id/documents', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const { category, label, fileName, mimeType, size, data } = req.body;

    if (!category || !fileName || !mimeType || !data) {
      return res.status(400).json({ error: 'category, fileName, mimeType, and data are required' });
    }

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!ALLOWED_TYPES.includes(mimeType)) {
      return res.status(400).json({ error: 'Only JPEG, PNG, WebP, and PDF files are allowed' });
    }

    if (size > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'File must be 2 MB or smaller' });
    }

    const employeeRepo = getEmployeeRepository();
    const updated = await employeeRepo.addDocument({
      user: req.user,
      id: req.params.id,
      doc: { category, label, fileName, mimeType, size, data },
    });

    if (!updated) return res.status(404).json({ error: 'Not found' });
    return res.status(201).json({ data: updated });
  } catch (err) {
    logger.error('POST /employees/:id/documents:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/employees/:id/documents/:docId — download a document
router.get('/:id/documents/:docId', async (req, res) => {
  try {
    const employeeRepo = getEmployeeRepository();
    const doc = await employeeRepo.getDocumentData({
      user: req.user,
      id: req.params.id,
      docId: req.params.docId,
    });

    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const buffer = Buffer.from(doc.data, 'base64');
    res.set('Content-Type', doc.mimeType);
    res.set('Content-Disposition', `attachment; filename="${doc.fileName}"`);
    res.set('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    logger.error('GET /employees/:id/documents/:docId:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/employees/:id/documents/:docId — remove an attachment
router.delete('/:id/documents/:docId', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const employeeRepo = getEmployeeRepository();
    const updated = await employeeRepo.removeDocument({
      user: req.user,
      id: req.params.id,
      docId: req.params.docId,
    });

    if (!updated) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: updated });
  } catch (err) {
    logger.error('DELETE /employees/:id/documents/:docId:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/employees/:id  (soft-delete)
router.delete('/:id', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const employeeRepo = getEmployeeRepository();
    const deleted = await employeeRepo.softDeleteEmployee({ user: req.user, id: req.params.id });
    if (!deleted) {
      return res.status(404).json({ error: 'Not found' });
    }

    writeAuditLog({ tableName: 'employees', recordId: req.params.id, operation: 'DELETE', changedBy: req.user.sub, beforeData: deleted, ipAddress: req.ip });
    return res.json({ message: 'Employee deactivated' });
  } catch (err) {
    logger.error('DELETE /employees/:id:', err.message);
    return res.status(err?.code === 'NOT_IMPLEMENTED' ? 501 : 500).json({ error: err.message });
  }
});

// ── Per-employee day-offs ────────────────────────────────────────────

// GET /api/employees/:id/day-offs
router.get('/:id/day-offs', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const repo = getEmployeeDayOffRepository();
    const items = await repo.listForEmployee({
      employeeId: req.params.id,
      tenantId:   req.user.tenantId,
      from:       req.query.from || null,
      to:         req.query.to   || null,
    });
    return res.json({ data: items });
  } catch (err) {
    logger.error('GET /employees/:id/day-offs:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/employees/:id/day-offs
router.post('/:id/day-offs', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const { date, type, startTime, endTime, reason } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required' });
    const VALID_TYPES = ['full_day', 'half_day_am', 'half_day_pm', 'custom'];
    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    if (type === 'custom' && (!startTime || !endTime)) {
      return res.status(400).json({ error: 'startTime and endTime are required for custom type' });
    }
    const repo = getEmployeeDayOffRepository();
    const item = await repo.upsert({
      tenantId:   req.user.tenantId,
      employeeId: req.params.id,
      date,
      type:       type || 'full_day',
      startTime:  startTime || null,
      endTime:    endTime   || null,
      reason:     reason    || null,
      createdBy:  req.user.sub,
    });
    return res.status(201).json({ data: item });
  } catch (err) {
    logger.error('POST /employees/:id/day-offs:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/employees/:id/day-offs/:dayOffId
router.delete('/:id/day-offs/:dayOffId', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const repo = getEmployeeDayOffRepository();
    const deleted = await repo.remove({ id: req.params.dayOffId, tenantId: req.user.tenantId });
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    logger.error('DELETE /employees/:id/day-offs/:dayOffId:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
