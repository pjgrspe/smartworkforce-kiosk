const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  branchId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  name:      { type: String, required: true, trim: true },
  code:      { type: String, uppercase: true, trim: true },
  description: { type: String },
  isActive:  { type: Boolean, default: true }
}, { timestamps: true });

departmentSchema.index({ tenantId: 1, code: 1 });

module.exports = mongoose.model('Department', departmentSchema);
