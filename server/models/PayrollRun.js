const mongoose = require('mongoose');

/**
 * PayrollRun — per systeminfo.md Section 5.
 * One document per cutoff period per tenant.
 * Payslip items are embedded for immutability after finalization.
 */

const payslipItemSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeCode:  { type: String },
  employeeName:  { type: String },

  // --- Earnings ---
  basicPay:      { type: Number, default: 0 },
  overtimePay:   { type: Number, default: 0 },
  holidayPay:    { type: Number, default: 0 },
  nightDiffPay:  { type: Number, default: 0 },
  allowances:    { type: Number, default: 0 },
  grossPay:      { type: Number, default: 0 },

  // --- Deductions ---
  lateDeduction:           { type: Number, default: 0 },
  undertimeDeduction:      { type: Number, default: 0 },
  sssContribution:         { type: Number, default: 0 },
  philHealthContribution:  { type: Number, default: 0 },
  pagIbigContribution:     { type: Number, default: 0 },
  withholdingTax:          { type: Number, default: 0 },
  otherDeductions:         { type: Number, default: 0 },
  totalDeductions:         { type: Number, default: 0 },

  netPay: { type: Number, default: 0 },

  // --- Worked hours summary ---
  regularHours:     { type: Number, default: 0 },
  overtimeHours:    { type: Number, default: 0 },
  nightDiffHours:   { type: Number, default: 0 },
  lateMinutes:      { type: Number, default: 0 },
  undertimeMinutes: { type: Number, default: 0 },
  absentDays:       { type: Number, default: 0 }
}, { _id: false });

const payrollRunSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },

  cutoffStart: { type: Date, required: true },
  cutoffEnd:   { type: Date, required: true },

  status: {
    type: String,
    enum: ['draft', 'pending_approval', 'approved', 'finalized'],
    default: 'draft'
  },

  payslipItems: [payslipItemSchema],

  // Computed totals
  totalGross:      { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },
  totalNet:        { type: Number, default: 0 },

  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  finalizedAt: { type: Date },

  notes: { type: String }
}, { timestamps: true });

payrollRunSchema.index({ tenantId: 1, branchId: 1, cutoffStart: 1, cutoffEnd: 1 }, { unique: true });

module.exports = mongoose.model('PayrollRun', payrollRunSchema);
