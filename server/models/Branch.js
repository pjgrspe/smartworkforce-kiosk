const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name:      { type: String, required: true, trim: true },
  code:      { type: String, required: true, uppercase: true, trim: true },
  address:   { type: String },
  phone:     { type: String },
  timezone:  { type: String, default: 'Asia/Manila' },
  isActive:  { type: Boolean, default: true }
}, { timestamps: true });

branchSchema.index({ tenantId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Branch', branchSchema);
