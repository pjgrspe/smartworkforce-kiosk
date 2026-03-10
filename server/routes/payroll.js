/**
 * Payroll Routes
 * Full workflow: create draft → compute → submit → approve → finalize
 */

const express    = require('express');
const router     = express.Router();
const PayrollRun = require('../models/PayrollRun');
const Employee   = require('../models/Employee');
const Tenant     = require('../models/Tenant');
const { computeEmployeeTime } = require('../services/time-engine');
const { computePayslip }      = require('../services/payroll-engine');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

router.use(authenticate);

// ── List ──────────────────────────────────────────────────────────

router.get('/', authorize('super_admin', 'client_admin', 'hr_payroll', 'auditor'), async (req, res) => {
  try {
    const runs = await PayrollRun.find({ tenantId: req.user.tenantId })
      .select('-payslipItems')
      .sort('-cutoffStart').lean();
    return res.json({ data: runs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Single run (with payslip items) ───────────────────────────────

router.get('/:id', authorize('super_admin', 'client_admin', 'hr_payroll', 'auditor'), async (req, res) => {
  try {
    const run = await PayrollRun.findOne({ _id: req.params.id, tenantId: req.user.tenantId }).lean();
    if (!run) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: run });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Create draft ──────────────────────────────────────────────────

router.post('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const { cutoffStart, cutoffEnd, notes } = req.body;
    if (!cutoffStart || !cutoffEnd) {
      return res.status(400).json({ error: 'cutoffStart and cutoffEnd are required' });
    }
    const run = await new PayrollRun({
      tenantId:    req.user.tenantId,
      cutoffStart: new Date(cutoffStart),
      cutoffEnd:   new Date(cutoffEnd),
      status:      'draft',
      createdBy:   req.user.sub,
      notes
    }).save();
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
      tenantId: req.user.tenantId,
      status: { $in: ['draft', 'pending_approval'] }
    });
    if (!run) return res.status(404).json({ error: 'Payroll run not found or not editable' });

    const tenant = await Tenant.findById(req.user.tenantId).lean();
    const settings = tenant?.settings || {};

    const employees = await Employee.find({
      tenantId: req.user.tenantId,
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

    run.payslipItems    = payslipItems;
    run.totalGross      = Math.round(payslipItems.reduce((s, p) => s + (p.grossPay || 0), 0) * 100) / 100;
    run.totalDeductions = Math.round(payslipItems.reduce((s, p) => s + (p.totalDeductions || 0), 0) * 100) / 100;
    run.totalNet        = Math.round(payslipItems.reduce((s, p) => s + (p.netPay || 0), 0) * 100) / 100;
    await run.save();

    logger.info(`Payroll run ${run._id}: gross=${run.totalGross}, net=${run.totalNet}`);
    return res.json({ data: run.toObject() });
  } catch (err) {
    logger.error('POST /payroll/:id/compute:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Submit for approval (draft → pending_approval) ────────────────

router.patch('/:id/submit', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const run = await PayrollRun.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId, status: 'draft' },
      { status: 'pending_approval' },
      { new: true }
    ).lean();
    if (!run) return res.status(404).json({ error: 'Not found or not in draft state' });
    return res.json({ data: run });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Approve (pending_approval → approved) ────────────────────────

router.patch('/:id/approve', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const run = await PayrollRun.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId, status: 'pending_approval' },
      { status: 'approved', approvedBy: req.user.sub },
      { new: true }
    ).lean();
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
      { _id: req.params.id, tenantId: req.user.tenantId, status: 'approved' },
      { status: 'finalized', finalizedAt: new Date() },
      { new: true }
    ).lean();
    if (!run) return res.status(404).json({ error: 'Not found or not in approved state' });
    logger.info(`Payroll run ${req.params.id} finalized`);
    return res.json({ data: run });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
