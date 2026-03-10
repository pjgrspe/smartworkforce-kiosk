const mongoose = require('mongoose');

const REASON_CODES = [
  'forgot_to_log',
  'device_down',
  'field_work',
  'system_error',
  'other'
];

const STATUSES = ['pending', 'approved', 'rejected'];

const correctionSchema = new mongoose.Schema({
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  employeeId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  targetDate:  { type: Date, required: true },
  reasonCode:  { type: String, enum: REASON_CODES, required: true },
  notes:       { type: String },

  // Snapshot of original and proposed attendance values
  before: { type: mongoose.Schema.Types.Mixed },
  after:  { type: mongoose.Schema.Types.Mixed },

  status:      { type: String, enum: STATUSES, default: 'pending' },
  reviewedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt:  { type: Date },
  reviewNotes: { type: String }

}, { timestamps: true });

correctionSchema.index({ tenantId: 1, employeeId: 1, status: 1 });

module.exports = mongoose.model('AttendanceCorrectionRequest', correctionSchema);
