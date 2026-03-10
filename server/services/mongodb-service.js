/**
 * MongoDB Service
 * Replaces supabase-sync.js — all database operations via Mongoose.
 */

const Employee       = require('../models/Employee');
const AttendanceLog  = require('../models/AttendanceLog');
const User           = require('../models/User');
const logger         = require('../utils/logger');
const { checkConnection } = require('../config/mongodb');

class MongoDBService {
  // ─── Connectivity ────────────────────────────────────────────────

  async isOnline() {
    return checkConnection();
  }

  // ─── Employees ───────────────────────────────────────────────────

  async getActiveEmployees(tenantId) {
    try {
      const data = await Employee.find({ tenantId, isActive: true })
        .select('-faceData.reEnrollmentHistory')
        .sort('lastName')
        .lean();
      return { success: true, data };
    } catch (err) {
      logger.error('getActiveEmployees:', err.message);
      return { success: false, error: err.message };
    }
  }

  async getEmployeeById(employeeId) {
    try {
      const data = await Employee.findById(employeeId).lean();
      if (!data) throw new Error('Employee not found');
      return { success: true, data };
    } catch (err) {
      logger.error('getEmployeeById:', err.message);
      return { success: false, error: err.message };
    }
  }

  async addEmployee(employeeData, createdBy) {
    try {
      const { faceData } = employeeData;
      if (!faceData?.encodings?.encodings || faceData.encodings.encodings.length < 3) {
        throw new Error('Face encodings must contain at least 3 arrays');
      }
      if (faceData.encodings.encodings.length > 5) {
        throw new Error('Face encodings must not exceed 5 arrays');
      }

      const employee = await new Employee({ ...employeeData, createdBy }).save();
      logger.info(`Employee added: ${employee._id}`);
      return { success: true, data: employee.toObject() };
    } catch (err) {
      logger.error('addEmployee:', err.message);
      return { success: false, error: err.message };
    }
  }

  async updateEmployee(employeeId, updates) {
    try {
      const data = await Employee.findByIdAndUpdate(
        employeeId,
        { $set: updates },
        { new: true, runValidators: true }
      ).lean();
      if (!data) throw new Error('Employee not found');
      logger.info(`Employee updated: ${employeeId}`);
      return { success: true, data };
    } catch (err) {
      logger.error('updateEmployee:', err.message);
      return { success: false, error: err.message };
    }
  }

  // Soft-delete
  async deleteEmployee(employeeId) {
    try {
      const data = await Employee.findByIdAndUpdate(
        employeeId,
        { $set: { isActive: false, 'employment.status': 'inactive' } },
        { new: true }
      ).lean();
      if (!data) throw new Error('Employee not found');
      logger.info(`Employee deactivated: ${employeeId}`);
      return { success: true, data };
    } catch (err) {
      logger.error('deleteEmployee:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ─── Attendance Logs ─────────────────────────────────────────────

  /**
   * Insert a synced attendance log coming from the offline buffer.
   * Uses upsert on localId to prevent duplicates.
   */
  async insertAttendanceLog(logData) {
    try {
      const filter = logData.localId ? { localId: logData.localId } : null;
      let doc;
      if (filter) {
        doc = await AttendanceLog.findOneAndUpdate(
          filter,
          { $setOnInsert: { ...logData, synced: true, syncedAt: new Date() } },
          { upsert: true, new: true, rawResult: false }
        ).lean();
      } else {
        doc = await new AttendanceLog({ ...logData, synced: true, syncedAt: new Date() }).save();
        doc = doc.toObject();
      }
      return { success: true, data: doc };
    } catch (err) {
      logger.error('insertAttendanceLog:', err.message);
      return { success: false, error: err.message };
    }
  }

  async getAttendanceLogs(filters = {}) {
    try {
      const query = {};
      if (filters.tenantId)    query.tenantId   = filters.tenantId;
      if (filters.employeeId)  query.employeeId = filters.employeeId;
      if (filters.branchId)    query.branchId   = filters.branchId;
      if (filters.start_date || filters.end_date) {
        query.timestamp = {};
        if (filters.start_date) query.timestamp.$gte = new Date(filters.start_date);
        if (filters.end_date)   query.timestamp.$lte = new Date(filters.end_date);
      }

      const limit = filters.limit || 200;
      const data = await AttendanceLog.find(query)
        .populate('employeeId', 'firstName lastName employeeCode')
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      return { success: true, data };
    } catch (err) {
      logger.error('getAttendanceLogs:', err.message);
      return { success: false, error: err.message };
    }
  }

  async getTodayAttendance(tenantId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.getAttendanceLogs({ tenantId, start_date: today.toISOString() });
  }

  // ─── Auth helpers ─────────────────────────────────────────────────

  async findUserByEmail(email) {
    return User.findOne({ email: email.toLowerCase(), isActive: true });
  }

  async updateLastLogin(userId) {
    await User.findByIdAndUpdate(userId, { $set: { lastLoginAt: new Date() } });
  }
}

module.exports = MongoDBService;
