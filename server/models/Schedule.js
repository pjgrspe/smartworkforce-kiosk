const mongoose = require('mongoose');

/**
 * Schedule model — per systeminfo.md Section 3.
 * Supports fixed, shifting, and flexible schedule types.
 */

const scheduleSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, uppercase: true, trim: true },
  type: {
    type: String,
    enum: ['fixed', 'shifting', 'flexible'],
    default: 'fixed'
  },

  // Times stored as "HH:mm" strings
  shiftStart: { type: String },  // e.g. "08:00"
  shiftEnd:   { type: String },  // e.g. "17:00"

  breakStart:          { type: String },  // e.g. "12:00"
  breakEnd:            { type: String },  // e.g. "13:00"
  breakDurationMinutes:{ type: Number, default: 60 },
  isPaidBreak:         { type: Boolean, default: false },

  // Policies
  gracePeriodMinutes:    { type: Number, default: 5 },
  undertimePolicyMinutes:{ type: Number, default: 0 },
  // 0 = no rounding; otherwise round to nearest N minutes
  roundingRuleMinutes:   { type: Number, default: 0 },
  allowMultiplePunches:  { type: Boolean, default: false },

  // Rest days: 0=Sun, 1=Mon, ..., 6=Sat
  restDays: [{ type: Number, min: 0, max: 6 }],

  isActive: { type: Boolean, default: true }
}, { timestamps: true });

scheduleSchema.index({ tenantId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Schedule', scheduleSchema);
