const mongoose = require('mongoose');

const DOC_TYPES = [
  'contract', 'government_id', 'nbi_clearance',
  'medical', 'memo', 'certificate', 'other'
];

const ACCESS_LEVELS = ['hr_only', 'hr_admin', 'employee'];

const documentSchema = new mongoose.Schema({
  tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },

  docType:   { type: String, enum: DOC_TYPES, required: true },
  fileName:  { type: String, required: true },
  filePath:  { type: String, required: true },   // disk path under uploads/
  mimeType:  { type: String },

  issueDate:   { type: Date },
  expiryDate:  { type: Date },
  notes:       { type: String },
  accessLevel: { type: String, enum: ACCESS_LEVELS, default: 'hr_only' },

  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

documentSchema.index({ employeeId: 1 });
documentSchema.index({ tenantId: 1, docType: 1 });

module.exports = mongoose.model('EmployeeDocument', documentSchema);
