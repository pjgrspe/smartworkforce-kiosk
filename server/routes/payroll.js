/**
 * Payroll Routes
 * Full workflow: create draft -> compute -> submit -> approve -> finalize
 */

const express = require('express');
const router = express.Router();
const { computeEmployeeTime } = require('../services/time-engine');
const { computePayslip } = require('../services/payroll-engine');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');
const { getBranchRepository } = require('../repositories/branch');
const { getPayrollRepository } = require('../repositories/payroll');
const { getEmployeeRepository } = require('../repositories/employee');
const { getTenantRepository } = require('../repositories/tenant');

async function resolvePayrollBranchId(req, requestedBranchId) {
  if (!['super_admin', 'client_admin'].includes(req.user.role) && req.user.branchId) {
    return req.user.branchId;
  }

  if (!requestedBranchId) return null;

  const branchRepo = getBranchRepository();
  const branch = await branchRepo.findActiveBranchById({
    id: requestedBranchId,
    tenantId: req.user.tenantId,
  });

  if (!branch) {
    throw new Error('Invalid branch for current tenant');
  }

  return branch._id || branch.id;
}

function buildPayrollScope(req) {
  const scope = { tenantId: req.user.tenantId };
  if (!['super_admin', 'client_admin'].includes(req.user.role) && req.user.branchId) {
    scope.branchId = req.user.branchId;
  }
  return scope;
}

function toRunId(run) {
  return run?._id || run?.id;
}

async function computeAndSaveRun(run, tenantId) {
  const tenantRepo = getTenantRepository();
  const employeeRepo = getEmployeeRepository();
  const payrollRepo = getPayrollRepository();

  const runId = toRunId(run);
  const tenant = await tenantRepo.findById(tenantId);
  const settings = tenant?.settings || {};

  const runBranchId = run.branchId && typeof run.branchId === 'object'
    ? (run.branchId._id || run.branchId.id)
    : run.branchId;

  const employees = await employeeRepo.listActiveForPayroll({
    tenantId,
    branchId: runBranchId || null,
  });

  logger.info(`Computing payroll for ${employees.length} employees (run ${runId})`);

  const payslipItems = [];
  for (const emp of employees) {
    try {
      const employeeId = emp._id || emp.id;
      const timeSummary = await computeEmployeeTime(
        String(employeeId),
        run.cutoffStart,
        run.cutoffEnd,
        settings,
      );
      const payslip = await computePayslip(timeSummary, settings);
      payslipItems.push(payslip);
    } catch (err) {
      const employeeId = emp._id || emp.id;
      logger.warn(`Payslip error for ${employeeId}: ${err.message}`);
      payslipItems.push({
        employeeId,
        employeeCode: emp.employeeCode,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        error: err.message,
        basicPay: 0,
        overtimePay: 0,
        holidayPay: 0,
        nightDiffPay: 0,
        allowances: 0,
        grossPay: 0,
        lateDeduction: 0,
        undertimeDeduction: 0,
        sssContribution: 0,
        philHealthContribution: 0,
        pagIbigContribution: 0,
        withholdingTax: 0,
        otherDeductions: 0,
        totalDeductions: 0,
        netPay: 0,
        regularHours: 0,
        overtimeHours: 0,
        nightDiffHours: 0,
        lateMinutes: 0,
        undertimeMinutes: 0,
        absentDays: 0,
      });
    }
  }

  const totalGross = Math.round(payslipItems.reduce((sum, item) => sum + (item.grossPay || 0), 0) * 100) / 100;
  const totalDeductions = Math.round(payslipItems.reduce((sum, item) => sum + (item.totalDeductions || 0), 0) * 100) / 100;
  const totalNet = Math.round(payslipItems.reduce((sum, item) => sum + (item.netPay || 0), 0) * 100) / 100;

  const updated = await payrollRepo.updateRun({
    id: runId,
    scope: { tenantId },
    patch: {
      payslipItems,
      totalGross,
      totalDeductions,
      totalNet,
    },
  });

  logger.info(`Payroll run ${runId}: gross=${totalGross}, net=${totalNet}`);
  return updated;
}

router.use(authenticate);

router.get('/me/payslips', async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.status(404).json({ error: 'No employee profile is linked to this account' });
    }

    const payrollRepo = getPayrollRepository();
    const runs = await payrollRepo.listEmployeePayslipRuns({
      tenantId: req.user.tenantId,
      employeeId: req.user.employeeId,
    });

    const payslips = runs.map((run) => {
      const employeeId = String(req.user.employeeId);
      const item = (run.payslipItems || []).find((entry) => {
        const entryId = typeof entry.employeeId === 'object'
          ? (entry.employeeId._id || entry.employeeId.id)
          : entry.employeeId;
        return String(entryId) === employeeId;
      });

      return {
        runId: run._id,
        branchId: run.branchId,
        cutoffStart: run.cutoffStart,
        cutoffEnd: run.cutoffEnd,
        status: run.status,
        approvedBy: run.approvedBy,
        finalizedAt: run.finalizedAt,
        payslip: item || null,
      };
    }).filter((entry) => entry.payslip);

    return res.json({ data: payslips });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/', authorize('super_admin', 'client_admin', 'hr_payroll', 'auditor'), async (req, res) => {
  try {
    const payrollRepo = getPayrollRepository();
    const runs = await payrollRepo.listRuns({
      scope: buildPayrollScope(req),
      includePayslipItems: false,
    });
    return res.json({ data: runs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authorize('super_admin', 'client_admin', 'hr_payroll', 'auditor'), async (req, res) => {
  try {
    const payrollRepo = getPayrollRepository();
    const run = await payrollRepo.findRunById({
      id: req.params.id,
      scope: buildPayrollScope(req),
      includePayslipItems: true,
    });
    if (!run) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: run });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const { cutoffStart, cutoffEnd, notes, branchId } = req.body;
    if (!cutoffStart || !cutoffEnd) {
      return res.status(400).json({ error: 'cutoffStart and cutoffEnd are required' });
    }

    const start = new Date(cutoffStart);
    const end = new Date(cutoffEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid cutoffStart or cutoffEnd' });
    }
    if (start > end) {
      return res.status(400).json({ error: 'cutoffStart must be on or before cutoffEnd' });
    }

    const payrollRepo = getPayrollRepository();
    const effectiveBranchId = await resolvePayrollBranchId(req, branchId);
    const existing = await payrollRepo.findExistingCutoffRun({
      tenantId: req.user.tenantId,
      branchId: effectiveBranchId,
      cutoffStart: start,
      cutoffEnd: end,
    });

    if (existing) {
      return res.status(409).json({ error: `Payroll run already exists for this cutoff period (${existing.status})` });
    }

    let run = await payrollRepo.createRun({
      tenantId: req.user.tenantId,
      branchId: effectiveBranchId,
      cutoffStart: start,
      cutoffEnd: end,
      status: 'draft',
      createdBy: req.user.sub,
      notes,
      payslipItems: [],
      totalGross: 0,
      totalDeductions: 0,
      totalNet: 0,
    });

    try {
      run = await computeAndSaveRun(run, req.user.tenantId);
    } catch (err) {
      await payrollRepo.deleteRun({ id: toRunId(run), scope: { tenantId: req.user.tenantId } });
      throw err;
    }

    return res.status(201).json({ data: run });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/:id/compute', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const payrollRepo = getPayrollRepository();
    const run = await payrollRepo.findRunByIdAndStatuses({
      id: req.params.id,
      scope: buildPayrollScope(req),
      statuses: ['draft', 'pending_approval'],
    });
    if (!run) return res.status(404).json({ error: 'Payroll run not found or not editable' });

    const updated = await computeAndSaveRun(run, req.user.tenantId);
    return res.json({ data: updated });
  } catch (err) {
    logger.error('POST /payroll/:id/compute:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/submit', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const payrollRepo = getPayrollRepository();
    const scope = buildPayrollScope(req);
    const run = await payrollRepo.findRunByIdAndStatuses({
      id: req.params.id,
      scope,
      statuses: ['draft'],
    });
    if (!run) return res.status(404).json({ error: 'Not found or not in draft state' });
    if (!Array.isArray(run.payslipItems) || run.payslipItems.length === 0) {
      return res.status(400).json({ error: 'Compute payroll before submitting for approval' });
    }
    const failedItems = run.payslipItems.filter((item) => item.error);
    if (failedItems.length > 0) {
      return res.status(400).json({ error: `Cannot submit payroll with ${failedItems.length} errored payslip item(s)` });
    }

    const updated = await payrollRepo.updateRun({
      id: toRunId(run),
      scope,
      patch: { status: 'pending_approval' },
    });
    return res.json({ data: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/approve', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const payrollRepo = getPayrollRepository();
    const scope = buildPayrollScope(req);
    const run = await payrollRepo.findRunByIdAndStatuses({
      id: req.params.id,
      scope,
      statuses: ['pending_approval'],
    });
    if (!run) return res.status(404).json({ error: 'Not found or not pending approval' });

    const updated = await payrollRepo.updateRun({
      id: toRunId(run),
      scope,
      patch: { status: 'approved', approvedBy: req.user.sub },
    });
    return res.json({ data: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/finalize', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const payrollRepo = getPayrollRepository();
    const scope = buildPayrollScope(req);
    const run = await payrollRepo.findRunByIdAndStatuses({
      id: req.params.id,
      scope,
      statuses: ['approved'],
    });
    if (!run) return res.status(404).json({ error: 'Not found or not in approved state' });

    const updated = await payrollRepo.updateRun({
      id: toRunId(run),
      scope,
      patch: { status: 'finalized', finalizedAt: new Date() },
    });
    logger.info(`Payroll run ${req.params.id} finalized`);
    return res.json({ data: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const payrollRepo = getPayrollRepository();
    const scope = buildPayrollScope(req);
    const run = await payrollRepo.findRunById({ id: req.params.id, scope, includePayslipItems: true });
    if (!run) return res.status(404).json({ error: 'Not found' });
    if (run.status === 'finalized' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can delete finalized payroll runs' });
    }

    await payrollRepo.deleteRun({ id: req.params.id, scope });
    logger.info(`Payroll run ${req.params.id} deleted by ${req.user.sub}`);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
