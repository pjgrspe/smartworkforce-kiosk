const mongoose = require('mongoose');

/**
 * SalaryStructure — per systeminfo.md Section 4.
 */

const allowanceSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  type:       { type: String, enum: ['fixed_monthly', 'per_day', 'per_hour'], default: 'fixed_monthly' },
  amount:     { type: Number, required: true },
  isTaxable:  { type: Boolean, default: false }
}, { _id: false });

const deductionSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  category: { type: String, enum: ['statutory', 'company', 'loan'], default: 'company' },
  // e.g. 'sss', 'philhealth', 'pagibig', 'tax', 'cash_advance', 'loan', 'uniform', 'penalty'
  subType:  { type: String },
  amount:   { type: Number, default: 0 },
  // If true, computed from contribution tables rather than a fixed amount
  isComputedFromTable: { type: Boolean, default: false }
}, { _id: false });

const salarySchema = new mongoose.Schema({
  tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },

  salaryType: {
    type: String,
    enum: ['monthly', 'daily', 'hourly'],
    default: 'monthly'
  },
  // Interpreted per salaryType: monthly salary, daily rate, or hourly rate
  basicRate: { type: Number, required: true },

  paymentFrequency: {
    type: String,
    enum: ['weekly', 'semi_monthly', 'monthly'],
    default: 'semi_monthly'
  },

  allowances:          [allowanceSchema],
  // Company-specific deductions beyond statutory (statutory are always computed)
  additionalDeductions:[deductionSchema],

  leaveCredits: {
    vacationLeave: { type: Number, default: 15 },
    sickLeave:     { type: Number, default: 15 }
  },

  overtimeEligible: { type: Boolean, default: true },
  nightDiffEligible:{ type: Boolean, default: true },

  effectiveDate: { type: Date, default: Date.now },
  isActive:      { type: Boolean, default: true }

}, { timestamps: true });

salarySchema.index({ employeeId: 1, isActive: 1 });

module.exports = mongoose.model('SalaryStructure', salarySchema);
