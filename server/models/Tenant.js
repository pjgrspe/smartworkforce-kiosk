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
    }
  },

  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Tenant', tenantSchema);
