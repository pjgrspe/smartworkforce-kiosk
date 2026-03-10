const mongoose = require('mongoose');

/**
 * AttendanceLog — per systeminfo.md Section 3.
 * Stores individual attendance punch events.
 */

const attendanceLogSchema = new mongoose.Schema({
  tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  branchId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },

  timestamp: { type: Date, required: true, default: Date.now },
  type:      {
    type: String,
    enum: ['IN', 'OUT', 'BREAK_IN', 'BREAK_OUT'],
    default: 'IN'
  },
  source: {
    type: String,
    enum: ['face_kiosk', 'web', 'admin_correction'],
    default: 'face_kiosk'
  },

  deviceId:        { type: String },
  confidenceScore: { type: Number, min: 0, max: 1 },

  // Exception flags (populated by Time Engine)
  exceptions: {
    isLate:             { type: Boolean, default: false },
    isEarlyOut:         { type: Boolean, default: false },
    isMissingOut:       { type: Boolean, default: false },
    isOvertimeCandidate:{ type: Boolean, default: false },
    lateMinutes:        { type: Number, default: 0 },
    undertimeMinutes:   { type: Number, default: 0 },
    overtimeMinutes:    { type: Number, default: 0 }
  },

  // Offline-first sync tracking (kept for NeDB → MongoDB flow)
  synced:   { type: Boolean, default: true },
  syncedAt: { type: Date },
  // localId matches the NeDB _id for duplicate detection during sync
  localId:  { type: String },

  correctionRef: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceCorrectionRequest' },
  notes:         { type: String }

}, { timestamps: true });

attendanceLogSchema.index({ tenantId: 1, employeeId: 1, timestamp: -1 });
attendanceLogSchema.index({ branchId: 1, timestamp: -1 });
attendanceLogSchema.index({ synced: 1 });
attendanceLogSchema.index({ localId: 1 });

module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);
