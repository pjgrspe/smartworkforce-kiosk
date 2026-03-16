const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { authenticate, authorize, signToken } = require('../middleware/auth');
const logger  = require('../utils/logger');
const { getUserRepository } = require('../repositories/user');
const { getBranchRepository } = require('../repositories/branch');
const { getEmployeeRepository } = require('../repositories/employee');

const CLIENT_ADMIN_MANAGEABLE_ROLES = ['hr_payroll', 'branch_manager', 'employee', 'auditor'];
const MAX_PROFILE_PICTURE_LENGTH = 2_100_000;

function sanitizeProfilePicture(value) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new Error('profilePictureUrl must be a string');
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const isDataImage = /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(trimmed);
  const isHttpImage = /^https?:\/\//.test(trimmed);
  if (!isDataImage && !isHttpImage) {
    throw new Error('profilePictureUrl must be an image data URL or http(s) URL');
  }
  if (trimmed.length > MAX_PROFILE_PICTURE_LENGTH) {
    throw new Error('profilePictureUrl is too large');
  }

  return trimmed;
}

async function resolveAssignableBranch(branchId, req) {
  if (!branchId) return null;

  const branchRepo = getBranchRepository();
  const branch = await branchRepo.findActiveBranchById({
    id: branchId,
    tenantId: req.user.role === 'super_admin' ? null : req.user.tenantId,
  });
  if (!branch) {
    throw new Error('Invalid branch for current tenant');
  }

  if (req.user.role !== 'super_admin' && req.user.branchId && String(branchId) !== String(req.user.branchId)) {
    throw new Error('You can only assign users to your own branch');
  }

  return branch;
}

function enforceManageableRole(role, req) {
  if (req.user.role === 'super_admin') return;
  if (!CLIENT_ADMIN_MANAGEABLE_ROLES.includes(role)) {
    throw new Error('Client admins can only manage HR, branch manager, employee, and auditor roles');
  }
}

async function validateEmployeeAccess(employeeId, req) {
  if (!employeeId) return null;

  const employeeRepo = getEmployeeRepository();
  const employee = await employeeRepo.findActiveEmployeeById({
    id: employeeId,
    tenantId: req.user.tenantId,
  });

  if (!employee) {
    throw new Error('Invalid employee for current tenant');
  }

  if (req.user.role !== 'super_admin' && req.user.branchId && String(employee.branchId) !== String(req.user.branchId)) {
    throw new Error('You can only assign users to employees in your own branch');
  }

  return employee;
}

router.use(authenticate);

// GET /api/users/me — current authenticated profile
router.get('/me', async (req, res) => {
  try {
    const userRepo = getUserRepository();
    const user = await userRepo.findMeById(req.user.sub);

    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ data: user });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/me — update own profile details
router.patch('/me', async (req, res) => {
  try {
    const userRepo = getUserRepository();
    const { firstName, lastName, email, password, oldPassword, profilePictureUrl } = req.body || {};
    const updates = {};

    if (firstName !== undefined) {
      const value = String(firstName).trim();
      if (!value) return res.status(400).json({ error: 'firstName cannot be empty' });
      updates.firstName = value;
    }

    if (lastName !== undefined) {
      const value = String(lastName).trim();
      if (!value) return res.status(400).json({ error: 'lastName cannot be empty' });
      updates.lastName = value;
    }

    if (email !== undefined) {
      const cleanEmail = String(email).toLowerCase().trim();
      if (!cleanEmail) return res.status(400).json({ error: 'email cannot be empty' });
      const duplicate = await userRepo.findByEmailExcludingId(cleanEmail, req.user.sub);
      if (duplicate) return res.status(409).json({ error: 'Email already in use' });
      updates.email = cleanEmail;
    }

    if (oldPassword !== undefined && password === undefined) {
      return res.status(400).json({ error: 'password is required when oldPassword is provided' });
    }

    if (password !== undefined) {
      const cleanPassword = String(password);
      if (cleanPassword.length < 6) {
        return res.status(400).json({ error: 'password must be at least 6 characters' });
      }

      if (!oldPassword) {
        return res.status(400).json({ error: 'oldPassword is required to change password' });
      }

      const currentPasswordHash = await userRepo.findPasswordById(req.user.sub);
      if (!currentPasswordHash) return res.status(404).json({ error: 'User not found' });

      const oldPasswordMatches = await bcrypt.compare(String(oldPassword), currentPasswordHash);
      if (!oldPasswordMatches) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      updates.passwordHash = await bcrypt.hash(cleanPassword, 12);
      updates.passwordChangedAt = new Date();
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'profilePictureUrl')) {
      updates.profilePictureUrl = sanitizeProfilePicture(profilePictureUrl);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No profile fields to update' });
    }

    const user = await userRepo.updateSelf(req.user.sub, updates);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const token = signToken(user);
    return res.json({ data: user, token });
  } catch (err) {
    logger.error('PATCH /users/me:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/users — list users (super_admin sees all, others see own tenant)
router.get('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const userRepo = getUserRepository();
    const users = await userRepo.listUsers({ requestUser: req.user });
    return res.json({ data: users });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/users — create user
router.post('/', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const userRepo = getUserRepository();
    const { email, password, role, firstName, lastName, branchId, tenantId, employeeId } = req.body;
    if (!email || !password || !role || !firstName || !lastName) {
      return res.status(400).json({ error: 'email, password, role, firstName and lastName are required' });
    }

    const existing = await userRepo.findByEmail(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    enforceManageableRole(role, req);

    const assignedEmployee = await validateEmployeeAccess(employeeId, req);
    if (role === 'employee' && !assignedEmployee) {
      return res.status(400).json({ error: 'employeeId is required for employee accounts' });
    }

    const assignedBranch = await resolveAssignableBranch(branchId || assignedEmployee?.branchId || null, req);
    const effectiveBranchId = req.user.role === 'super_admin'
      ? (assignedBranch?._id || null)
      : (req.user.branchId || assignedBranch?._id || null);
    const effectiveTenantId = req.user.role === 'super_admin'
      ? (tenantId || assignedEmployee?.tenantId || assignedBranch?.tenantId || null)
      : req.user.tenantId;

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await userRepo.createUser({
      email:        email.toLowerCase().trim(),
      passwordHash,
      role,
      firstName,
      lastName,
      branchId: effectiveBranchId,
      tenantId: effectiveTenantId,
      employeeId: assignedEmployee?._id || null,
      isActive: true
    });

    logger.info(`User created: ${user.email} role=${user.role}`);
    return res.status(201).json({ data: user });
  } catch (err) {
    logger.error('POST /users:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/users/:id
router.patch('/:id', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const userRepo = getUserRepository();
    const existingUser = await userRepo.findScopedUser({ requestUser: req.user, userId: req.params.id });
    if (!existingUser) return res.status(404).json({ error: 'Not found' });

    const updates = { ...req.body };
    delete updates.email; // email is immutable once set
    if (updates.password) {
      updates.passwordHash = await bcrypt.hash(updates.password, 12);
      delete updates.password;
    }

    const nextRole = updates.role || existingUser.role;
    enforceManageableRole(nextRole, req);

    const nextEmployeeId = Object.prototype.hasOwnProperty.call(updates, 'employeeId')
      ? (updates.employeeId || null)
      : existingUser.employeeId;
    const assignedEmployee = await validateEmployeeAccess(nextEmployeeId, req);
    if (nextRole === 'employee' && !assignedEmployee) {
      return res.status(400).json({ error: 'employeeId is required for employee accounts' });
    }

    const requestedBranchId = Object.prototype.hasOwnProperty.call(updates, 'branchId')
      ? (updates.branchId || null)
      : (assignedEmployee?.branchId || existingUser.branchId);
    const assignedBranch = await resolveAssignableBranch(requestedBranchId, req);
    const effectiveBranchId = req.user.role === 'super_admin'
      ? (assignedBranch?._id || null)
      : (req.user.branchId || existingUser.branchId || null);
    const effectiveTenantId = req.user.role === 'super_admin'
      ? (Object.prototype.hasOwnProperty.call(updates, 'tenantId') ? (updates.tenantId || null) : (assignedEmployee?.tenantId || assignedBranch?.tenantId || req.user.tenantId))
      : req.user.tenantId;
    updates.branchId = effectiveBranchId;
    updates.employeeId = assignedEmployee?._id || null;
    updates.tenantId = effectiveTenantId;

    const user = await userRepo.updateUserById(req.params.id, updates);
    if (!user) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: user });
  } catch (err) {
    logger.error('PATCH /users:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const userRepo = getUserRepository();
    if (req.params.id === req.user.sub) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const existingUser = await userRepo.findScopedUser({ requestUser: req.user, userId: req.params.id });
    if (!existingUser) {
      return res.status(404).json({ error: 'Not found' });
    }

    enforceManageableRole(existingUser.role, req);
    await userRepo.deleteScopedUser({ requestUser: req.user, userId: req.params.id });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
