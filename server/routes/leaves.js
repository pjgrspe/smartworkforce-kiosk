const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const logger  = require('../utils/logger');
const { getLeaveRepository }          = require('../repositories/leave-request');
const { getEmployeeDayOffRepository } = require('../repositories/employee-day-off');
const { getEmployeeRepository }       = require('../repositories/employee');
const { getTenantRepository }         = require('../repositories/tenant');

const DEFAULT_QUOTAS = { sick_leave: 5, vacation_leave: 5 };

async function getTenantQuotas(tenantId) {
  const repo = getTenantRepository();
  const tenant = await repo.findById(tenantId);
  const q = tenant?.settings?.leaveQuotas || {};
  return {
    sick_leave:     Number(q.sick_leave     ?? DEFAULT_QUOTAS.sick_leave),
    vacation_leave: Number(q.vacation_leave ?? DEFAULT_QUOTAS.vacation_leave),
  };
}

/** Resolve effective leave quotas for an employee (employee overrides > tenant defaults). */
async function resolveEmployeeLeave(tenantId, employeeId) {
  const employeeRepo  = getEmployeeRepository();
  const tenantQuotas  = await getTenantQuotas(tenantId);
  const employee      = await employeeRepo.findActiveEmployeeById({ id: employeeId, tenantId });
  const cfg           = employee?.leaveConfig || {};
  const hasAccess     = cfg.leaveType !== 'without_leaves';
  return {
    hasAccess,
    sick_leave: {
      enabled:   hasAccess && cfg.hasSl !== false,
      quota:     cfg.slQuota != null ? Number(cfg.slQuota) : tenantQuotas.sick_leave,
    },
    vacation_leave: {
      enabled:   hasAccess && cfg.hasVl !== false,
      quota:     cfg.vlQuota != null ? Number(cfg.vlQuota) : tenantQuotas.vacation_leave,
    },
  };
}

/** Validate that the employee has enough balance for the requested leave. */
async function checkBalance({ tenantId, employeeId, leaveType, startDate, endDate }) {
  const year      = new Date(startDate).getFullYear();
  const emp       = await resolveEmployeeLeave(tenantId, employeeId);

  if (!emp.hasAccess) {
    throw new Error('This employee does not have leave access.');
  }
  const typeConfig = emp[leaveType];
  if (!typeConfig?.enabled) {
    const label = leaveType === 'sick_leave' ? 'Sick Leave' : 'Vacation Leave';
    throw new Error(`${label} is not enabled for this employee.`);
  }

  const quota     = typeConfig.quota;
  const leaveRepo = getLeaveRepository();
  const used      = await leaveRepo.getDaysUsed({ employeeId, year });
  const usedForType = used[leaveType] || 0;

  const ms = new Date(endDate + 'T00:00:00Z') - new Date(startDate + 'T00:00:00Z');
  const requested = Math.max(1, Math.round(ms / 86400000) + 1);
  const remaining = quota - usedForType;
  if (requested > remaining) {
    const label = leaveType === 'sick_leave' ? 'Sick Leave' : 'Vacation Leave';
    throw new Error(
      `Insufficient ${label} balance. Requesting ${requested} day(s) but only ${remaining} of ${quota} remaining for ${year}.`
    );
  }
}

const REVIEWER_ROLES = ['super_admin', 'client_admin', 'hr_payroll', 'branch_manager'];

async function getScopedEmployeeIds(req) {
  if (['super_admin', 'client_admin'].includes(req.user.role) || !req.user.branchId) return null;
  const employeeRepo = getEmployeeRepository();
  const employees = await employeeRepo.listActive({ user: req.user });
  return employees.map(e => e._id || e.id);
}

/** All YYYY-MM-DD dates between start and end inclusive */
function dateRange(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate + 'T00:00:00Z');
  const end   = new Date(endDate   + 'T00:00:00Z');
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

router.use(authenticate);

function buildBalanceData(year, empLeave, used) {
  const sl = empLeave.sick_leave;
  const vl = empLeave.vacation_leave;
  return {
    year,
    hasAccess: empLeave.hasAccess,
    sick_leave: {
      enabled:   sl.enabled,
      quota:     sl.enabled ? sl.quota : 0,
      used:      used.sick_leave,
      remaining: sl.enabled ? sl.quota - used.sick_leave : 0,
    },
    vacation_leave: {
      enabled:   vl.enabled,
      quota:     vl.enabled ? vl.quota : 0,
      used:      used.vacation_leave,
      remaining: vl.enabled ? vl.quota - used.vacation_leave : 0,
    },
  };
}

// GET /api/leaves/me/balance — remaining SL/VL for the current year
router.get('/me/balance', async (req, res) => {
  try {
    if (!req.user.employeeId) return res.json({ data: { hasAccess: false, sick_leave: { enabled: false, quota: 0, used: 0, remaining: 0 }, vacation_leave: { enabled: false, quota: 0, used: 0, remaining: 0 } } });
    const year      = parseInt(req.query.year) || new Date().getFullYear();
    const leaveRepo = getLeaveRepository();
    const empLeave  = await resolveEmployeeLeave(req.user.tenantId, req.user.employeeId);
    const used      = await leaveRepo.getDaysUsed({ employeeId: req.user.employeeId, year });
    return res.json({ data: buildBalanceData(year, empLeave, used) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/leaves/balance/:employeeId — HR checks any employee's balance
router.get('/balance/:employeeId', authorize(...REVIEWER_ROLES), async (req, res) => {
  try {
    const year      = parseInt(req.query.year) || new Date().getFullYear();
    const leaveRepo = getLeaveRepository();
    const empLeave  = await resolveEmployeeLeave(req.user.tenantId, req.params.employeeId);
    const used      = await leaveRepo.getDaysUsed({ employeeId: req.params.employeeId, year });
    return res.json({ data: buildBalanceData(year, empLeave, used) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/leaves/me — employee's own leave requests
router.get('/me', async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.status(404).json({ error: 'No employee profile is linked to this account' });
    }
    const leaveRepo = getLeaveRepository();
    const leaves = await leaveRepo.listMyLeaves({
      tenantId:   req.user.tenantId,
      employeeId: req.user.employeeId,
      status:     req.query.status,
    });
    return res.json({ data: leaves });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/leaves/me — employee submits own leave request
router.post('/me', async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.status(404).json({ error: 'No employee profile is linked to this account' });
    }
    const { leaveType, startDate, endDate, notes } = req.body;
    if (!leaveType || !startDate || !endDate) {
      return res.status(400).json({ error: 'leaveType, startDate, and endDate are required' });
    }
    if (startDate > endDate) {
      return res.status(400).json({ error: 'startDate must be on or before endDate' });
    }

    await checkBalance({ tenantId: req.user.tenantId, employeeId: req.user.employeeId, leaveType, startDate, endDate });

    const leaveRepo = getLeaveRepository();
    const leave = await leaveRepo.createLeave({
      tenantId:    req.user.tenantId,
      employeeId:  req.user.employeeId,
      requestedBy: req.user.sub,
      leaveType,
      startDate,
      endDate,
      notes,
    });
    logger.info(`Leave request submitted by employee ${req.user.employeeId}`);
    return res.status(201).json({ data: leave });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/leaves — HR/admin view all leave requests
router.get('/', authorize(...REVIEWER_ROLES, 'auditor'), async (req, res) => {
  try {
    const scopedEmployeeIds = await getScopedEmployeeIds(req);
    const leaveRepo = getLeaveRepository();
    const leaves = await leaveRepo.listLeaves({
      tenantId:           req.user.tenantId,
      status:             req.query.status,
      employeeId:         req.query.employeeId,
      scopedEmployeeIds,
    });
    return res.json({ data: leaves });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/leaves — HR submits leave on behalf of employee (auto-approve)
router.post('/', authorize(...REVIEWER_ROLES), async (req, res) => {
  try {
    const { employeeId, leaveType, startDate, endDate, notes } = req.body;
    if (!employeeId || !leaveType || !startDate || !endDate) {
      return res.status(400).json({ error: 'employeeId, leaveType, startDate, and endDate are required' });
    }
    if (startDate > endDate) {
      return res.status(400).json({ error: 'startDate must be on or before endDate' });
    }

    const employeeRepo = getEmployeeRepository();
    const employee = await employeeRepo.findActiveEmployeeById({
      id:       employeeId,
      tenantId: req.user.tenantId,
    });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    await checkBalance({ tenantId: req.user.tenantId, employeeId, leaveType, startDate, endDate });

    const leaveRepo = getLeaveRepository();
    const leave = await leaveRepo.createLeave({
      tenantId:    req.user.tenantId,
      employeeId,
      requestedBy: req.user.sub,
      leaveType,
      startDate,
      endDate,
      notes,
    });
    logger.info(`Leave request created by HR ${req.user.email} for employee ${employeeId}`);
    return res.status(201).json({ data: leave });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/leaves/:id/approve
router.patch('/:id/approve', authorize(...REVIEWER_ROLES), async (req, res) => {
  try {
    const scopedEmployeeIds = await getScopedEmployeeIds(req);
    const leaveRepo = getLeaveRepository();

    const leave = await leaveRepo.findPendingLeave({
      id:       req.params.id,
      tenantId: req.user.tenantId,
      scopedEmployeeIds,
    });
    if (!leave) return res.status(404).json({ error: 'Not found or already reviewed' });

    // Mark approved in DB
    const approved = await leaveRepo.approveLeave({
      id:         req.params.id,
      tenantId:   req.user.tenantId,
      reviewerId: req.user.sub,
      notes:      req.body.notes,
    });

    // Create paid day-off entries for each date in the approved range
    const dayOffRepo = getEmployeeDayOffRepository();
    const leaveLabel = leave.leaveType === 'sick_leave' ? 'Sick Leave' : 'Vacation Leave';
    const dates = dateRange(leave.startDate, leave.endDate);
    for (const date of dates) {
      await dayOffRepo.upsert({
        tenantId:   req.user.tenantId,
        employeeId: leave.employeeId,
        date,
        type:       'full_day',
        source:     'leave',
        isPaid:     true,
        reason:     `${leaveLabel} — Approved`,
        createdBy:  req.user.sub,
      });
    }

    logger.info(`Leave ${req.params.id} approved by ${req.user.email} — ${dates.length} paid day-off(s) created`);
    return res.json({ data: approved });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/leaves/:id/reject
router.patch('/:id/reject', authorize(...REVIEWER_ROLES), async (req, res) => {
  try {
    const scopedEmployeeIds = await getScopedEmployeeIds(req);
    const leaveRepo = getLeaveRepository();
    const leave = await leaveRepo.rejectLeave({
      id:       req.params.id,
      tenantId: req.user.tenantId,
      scopedEmployeeIds,
      reviewerId: req.user.sub,
      notes:    req.body.notes,
    });
    if (!leave) return res.status(404).json({ error: 'Not found or already reviewed' });
    return res.json({ data: leave });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
