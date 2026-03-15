const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  // Short code, e.g. "ACME"
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  domain: { type: String, trim: true },
  logoUrl: { type: String },
  contactEmail: { type: String, lowercase: true, trim: true },
  contactPhone: { type: String },
  address: { type: String },

  subscription: {
    plan: { type: String, enum: ['basic', 'standard', 'enterprise'], default: 'basic' },
    maxEmployees: { type: Number, default: 50 },
    maxBranches: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date }
  },

  settings: {
    timezone: { type: String, default: 'Asia/Manila' },
    currency: { type: String, default: 'PHP' },
    gracePeriodMinutes: { type: Number, default: 5 },
    // Round punches to nearest N minutes (0 = no rounding)
    roundingRuleMinutes: { type: Number, default: 0 },
    overtimeMultipliers: {
      regular:        { type: Number, default: 1.25 },
      restDay:        { type: Number, default: 1.30 },
      specialHoliday: { type: Number, default: 1.30 },
      regularHoliday: { type: Number, default: 2.00 },
      nightDiff:      { type: Number, default: 0.10 }  // additive, per DOLE
    },
    nightDiffWindow: {
      start: { type: String, default: '22:00' },
      end:   { type: String, default: '06:00' }
    },
    payslip: {
      companyDisplayName: { type: String, trim: true, default: '' },
      headerSubtitle: { type: String, trim: true, default: 'Payroll Payslip' },
      companyAddressLine: { type: String, trim: true, default: '' },
      footerNote: {
        type: String,
        trim: true,
        default: 'This document is system-generated and valid without a physical signature.'
      },
      signatories: {
        preparedByName: { type: String, trim: true, default: 'Payroll Officer' },
        preparedByTitle: { type: String, trim: true, default: 'Prepared By' },
        reviewedByName: { type: String, trim: true, default: 'HR Manager' },
        reviewedByTitle: { type: String, trim: true, default: 'Reviewed By' },
        approvedByName: { type: String, trim: true, default: 'Authorized Signatory' },
        approvedByTitle: { type: String, trim: true, default: 'Approved By' },
        receivedByLabel: { type: String, trim: true, default: 'Received By Employee' }
      }
    }
  },

  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Tenant', tenantSchema);
