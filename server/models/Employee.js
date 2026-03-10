const mongoose = require('mongoose');

/**
 * Employee model — full profile per systeminfo.md Section 2.
 */

const employeeSchema = new mongoose.Schema({
  tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  branchId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },

  // Unique employee code within the tenant (e.g. "EMP-001")
  employeeCode: { type: String, required: true, trim: true },

  // Core identity
  firstName:  { type: String, required: true, trim: true },
  middleName: { type: String, trim: true },
  lastName:   { type: String, required: true, trim: true },
  photoUrl:   { type: String },

  // Personal (optional)
  dateOfBirth:   { type: Date },
  gender:        { type: String, enum: ['male', 'female', 'other', ''], default: '' },
  contactNumber: { type: String },
  email:         { type: String, lowercase: true, trim: true },
  address:       { type: String },

  // Employment details
  employment: {
    status: {
      type: String,
      enum: ['active', 'inactive', 'resigned', 'terminated'],
      default: 'active'
    },
    type: {
      type: String,
      enum: ['regular', 'probationary', 'contractual', 'part_time'],
      default: 'regular'
    },
    dateHired:           { type: Date },
    regularizationDate:  { type: Date },
    resignationDate:     { type: Date },
    position:            { type: String },
    supervisorId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }
  },

  // Philippine government IDs
  govIds: {
    tin:        { type: String },
    sss:        { type: String },
    philHealth: { type: String },
    pagIbig:    { type: String }
  },

  // Bank details
  bank: {
    bankName:      { type: String },
    accountNumber: { type: String }
  },

  // Tax
  taxStatus:  { type: String },  // 'ME', 'S', etc. per BIR
  dependents: { type: Number, default: 0 },

  // Face biometric data
  faceData: {
    // Format: { encodings: [[128 floats], [128 floats], ...] } — min 3, max 5
    encodings:        { type: mongoose.Schema.Types.Mixed },
    // face-api.js (browser) descriptors — array of Float32Array-compatible arrays
    faceApiDescriptors: [{ type: mongoose.Schema.Types.Mixed }],
    enrollmentDate:   { type: Date },
    enrollmentBranchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    lastVerificationAt: { type: Date },
    // Local file paths for enrolled photos
    photoPaths: [{ type: String }],
    reEnrollmentHistory: [{
      enrolledAt: { type: Date },
      enrolledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      note:       { type: String }
    }]
  },

  // Schedule assignment
  scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Schedule', default: null },

  isActive:  { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { timestamps: true, toJSON: { virtuals: true } });

employeeSchema.index({ tenantId: 1, employeeCode: 1 }, { unique: true });
employeeSchema.index({ tenantId: 1, 'employment.status': 1 });
employeeSchema.index({ branchId: 1 });

employeeSchema.virtual('fullName').get(function () {
  return [this.firstName, this.middleName, this.lastName].filter(Boolean).join(' ');
});

module.exports = mongoose.model('Employee', employeeSchema);
