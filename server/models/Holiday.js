const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name:     { type: String, required: true },
  date:     { type: Date, required: true },
  type:     {
    type: String,
    enum: ['regular', 'special_non_working'],
    required: true
  }
}, { timestamps: true });

holidaySchema.index({ tenantId: 1, date: 1 });

module.exports = mongoose.model('Holiday', holidaySchema);
