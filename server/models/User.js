const mongoose = require('mongoose');

/**
 * User model — authentication and authorization.
 * Roles map to systeminfo.md Section 1:
 *   super_admin    → DE Webnet / System Owner
 *   client_admin   → Owner / Top Management
 *   hr_payroll     → HR / Payroll Officer
 *   branch_manager → Branch Manager / Supervisor
 *   employee       → Employee self-service
 *   auditor        → Read-only Auditor / Accounting
 */

const ROLES = [
  'super_admin',
  'client_admin',
  'hr_payroll',
  'branch_manager',
  'employee',
  'auditor'
];

const userSchema = new mongoose.Schema({
  // null for super_admin (system-wide)
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
  branchId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },

  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  firstName:    { type: String, required: true, trim: true },
  lastName:     { type: String, required: true, trim: true },
  profilePictureUrl: { type: String, default: null },
  role:         { type: String, enum: ROLES, required: true },

  // Link to the Employee profile for the employee/branch_manager roles
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },

  isActive:          { type: Boolean, default: true },
  lastLoginAt:       { type: Date },
  passwordChangedAt: { type: Date }
}, { timestamps: true });

userSchema.index({ tenantId: 1, role: 1 });

module.exports = mongoose.model('User', userSchema);
