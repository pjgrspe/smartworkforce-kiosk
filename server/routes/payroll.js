/**
 * Payroll Routes
 * Full workflow: create draft → compute → submit → approve → finalize
 */

const express    = require('express');
const router     = express.Router();
const Branch     = require('../models/Branch');
const PayrollRun = require('../models/PayrollRun');
const Employee   = require('../models/Employee');
const Tenant     = require('../models/Tenant');
const { computeEmployeeTime } = require('../services/time-engine');
const { computePayslip }      = require('../services/payroll-engine');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

async function resolvePayrollBranchId(req, requestedBranchId) {
  if (req.user.role !== 'super_admin' && req.user.branchId) {
    return req.user.branchId;
  }

  if (!requestedBranchId) return null;

  const branch = await Branch.findOne({
    _id: requestedBranchId,
    tenantId: req.user.tenantId,
    isActive: true,
  }).select('_id').lean();

  if (!branch) {
    throw new Error('Invalid branch for current tenant');
  }

  return branch._id;
}

function buildPayrollScope(req) {
  const scope = { tenantId: req.user.tenantId };
  if (req.user.role !== 'super_admin' && req.user.branchId) {
    scope.branchId = req.user.branchId;
  }
  return scope;
}

async function computeAndSaveRun(run, tenantId) {
  const tenant = await Tenant.findById(tenantId).lean();
  const settings = tenant?.settings || {};

  const employees = await Employee.find({
    tenantId,
    ...(run.branchId ? { branchId: run.branchId } : {}),
    isActive: true,
    'employment.status': 'active'
  }).lean();

  logger.info(`Computing payroll for ${employees.length} employees (run ${run._id})`);

  const payslipItems = [];
  for (const emp of employees) {
    try {
      const timeSummary = await computeEmployeeTime(
        emp._id.toString(),
        run.cutoffStart,
        run.cutoffEnd,
        settings
      );
      const payslip = await computePayslip(timeSummary, settings);
      payslipItems.push(payslip);
    } catch (err) {
      logger.warn(`Payslip error for ${emp._id}: ${err.message}`);
      payslipItems.push({
        employeeId:   emp._id,
        employeeCode: emp.employeeCode,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        error:        err.message,
        basicPay: 0, overtimePay: 0, holidayPay: 0, nightDiffPay: 0,
        allowances: 0, grossPay: 0, lateDeduction: 0, undertimeDeduction: 0,
        sssContribution: 0, philHealthContribution: 0, pagIbigContribution: 0,
        withholdingTax: 0, otherDeductions: 0, totalDeductions: 0, netPay: 0,
        regularHours: 0, overtimeHours: 0, nightDiffHours: 0,
        lateMinutes: 0, undertimeMinutes: 0, absentDays: 0
      });
    }
  }

  run.payslipItems = payslipItems;
  run.totalGross = Math.round(payslipItems.reduce((sum, item) => sum + (item.grossPay || 0), 0) * 100) / 100;
  run.totalDeductions = Math.round(payslipItems.reduce((sum, item) => sum + (item.totalDeductions || 0), 0) * 100) / 100;
  run.totalNet = Math.round(payslipItems.reduce((sum, item) => sum + (item.netPay || 0), 0) * 100) / 100;
  await run.save();

  logger.info(`Payroll run ${run._id}: gross=${run.totalGross}, net=${run.totalNet}`);
  return run;
}

router.use(authenticate);

// ── Self-service payslips ────────────────────────────────────────

router.get('/me/payslips', async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.status(404).json({ error: 'No employee profile is linked to this account' });
    }

    const runs = await PayrollRun.find({
      tenantId: req.user.tenantId,
      status: { $in: ['approved', 'finalized'] },
      'payslipItems.employeeId': req.user.employeeId,
    })
      .populate('branchId', 'name code')
      .sort('-cutoffStart')
      .lean();

    const payslips = runs.map((run) => {
      const item = (run.payslipItems || []).find(
        (entry) => String(entry.employeeId) === String(req.user.employeeId)
      );

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

// ── List ──────────────────────────────────────────────────────────

router.get('/', authorize('super_admin', 'client_admin', 'hr_payroll', 'auditor'), async (req, res) => {
  try {
    const runs = await PayrollRun.find(buildPayrollScope(req))
      .select('-payslipItems')
      .populate('branchId', 'name code')
      .sort('-cutoffStart').lean();
    return res.json({ data: runs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Single run (with payslip items) ───────────────────────────────

router.get('/:id', authorize('super_admin', 'client_admin', 'hr_payroll', 'auditor'), async (req, res) => {
  try {
    const run = await PayrollRun.findOne({ _id: req.params.id, ...buildPayrollScope(req) })
      .populate('branchId', 'name code')
      .lean();
    if (!run) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: run });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Create run and auto-compute ───────────────────────────────────

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

    const effectiveBranchId = await resolvePayrollBranchId(req, branchId);

    const existing = await PayrollRun.findOne({
      tenantId: req.user.tenantId,
      branchId: effectiveBranchId,
      cutoffStart: start,
      cutoffEnd: end,
    }).select('_id status').lean();
    if (existing) {
      return res.status(409).json({ error: `Payroll run already exists for this cutoff period (${existing.status})` });
    }

    let run = await new PayrollRun({
      tenantId:    req.user.tenantId,
      branchId:    effectiveBranchId,
      cutoffStart: start,
      cutoffEnd:   end,
      status:      'draft',
      createdBy:   req.user.sub,
      notes
    }).save();

    try {
      run = await computeAndSaveRun(run, req.user.tenantId);
    } catch (err) {
      await PayrollRun.deleteOne({ _id: run._id });
      throw err;
    }

    return res.status(201).json({ data: run.toObject() });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ── Compute (run Time Engine + Payroll Engine) ────────────────────

router.post('/:id/compute', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const run = await PayrollRun.findOne({
      _id: req.params.id,
      ...buildPayrollScope(req),
      status: { $in: ['draft', 'pending_approval'] }
    });
    if (!run) return res.status(404).json({ error: 'Payroll run not found or not editable' });

    await computeAndSaveRun(run, req.user.tenantId);
    return res.json({ data: run.toObject() });
  } catch (err) {
    logger.error('POST /payroll/:id/compute:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Submit for approval (draft → pending_approval) ────────────────

router.patch('/:id/submit', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const run = await PayrollRun.findOne({ _id: req.params.id, ...buildPayrollScope(req), status: 'draft' });
    if (!run) return res.status(404).json({ error: 'Not found or not in draft state' });
    if (!Array.isArray(run.payslipItems) || run.payslipItems.length === 0) {
      return res.status(400).json({ error: 'Compute payroll before submitting for approval' });
    }
    const failedItems = run.payslipItems.filter(item => item.error);
    if (failedItems.length > 0) {
      return res.status(400).json({ error: `Cannot submit payroll with ${failedItems.length} errored payslip item(s)` });
    }

    run.status = 'pending_approval';
    await run.save();
    return res.json({ data: run.toObject() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Approve (pending_approval → approved) ────────────────────────

router.patch('/:id/approve', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const run = await PayrollRun.findOneAndUpdate(
      { _id: req.params.id, ...buildPayrollScope(req), status: 'pending_approval' },
      { status: 'approved', approvedBy: req.user.sub },
      { new: true }
    ).populate('branchId', 'name code').lean();
    if (!run) return res.status(404).json({ error: 'Not found or not pending approval' });
    return res.json({ data: run });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Finalize (approved → finalized, immutable) ───────────────────

router.patch('/:id/finalize', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const run = await PayrollRun.findOneAndUpdate(
      { _id: req.params.id, ...buildPayrollScope(req), status: 'approved' },
      { status: 'finalized', finalizedAt: new Date() },
      { new: true }
    ).populate('branchId', 'name code').lean();
    if (!run) return res.status(404).json({ error: 'Not found or not in approved state' });
    logger.info(`Payroll run ${req.params.id} finalized`);
    return res.json({ data: run });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Delete (non-finalized only) ───────────────────────────────────

router.delete('/:id', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const run = await PayrollRun.findOne({ _id: req.params.id, ...buildPayrollScope(req) });
    if (!run) return res.status(404).json({ error: 'Not found' });
    if (run.status === 'finalized' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can delete finalized payroll runs' });
    }

    await PayrollRun.deleteOne({ _id: req.params.id, ...buildPayrollScope(req) });
    logger.info(`Payroll run ${req.params.id} deleted by ${req.user.sub}`);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
