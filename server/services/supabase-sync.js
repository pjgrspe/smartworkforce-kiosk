/**
 * Supabase Sync Service
 * Handles all Supabase database operations
 * Employee CRUD, attendance queries, face encoding management
 */

const { supabaseAdmin, supabase } = require('../config/supabase');
const logger = require('../utils/logger');

class SupabaseSyncService {
  constructor() {
    this.client = supabaseAdmin || supabase;
  }

  /**
   * Get all active employees with face encodings
   */
  async getActiveEmployees() {
    try {
      const { data, error } = await this.client
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      logger.info(`Fetched ${data.length} active employees`);
      return { success: true, data };
    } catch (error) {
      logger.error('Failed to fetch employees:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get employee by ID
   */
  async getEmployeeById(employeeId) {
    try {
      const { data, error } = await this.client
        .from('employees')
        .select('*')
        .eq('id', employeeId)
        .single();

      if (error) throw error;

      return { success: true, data };
    } catch (error) {
      logger.error(`Failed to fetch employee ${employeeId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add new employee
   */
  async addEmployee(employeeData) {
    try {
      const { name, email, employee_code, department, position, face_encodings, photo_paths, created_by } = employeeData;

      // Validate face encodings
      if (!face_encodings || !face_encodings.encodings || face_encodings.encodings.length < 3 || face_encodings.encodings.length > 5) {
        throw new Error('Face encodings must contain 3-5 encoding arrays');
      }

      const { data, error } = await this.client
        .from('employees')
        .insert({
          name,
          email,
          employee_code,
          department,
          position,
          face_encodings,
          photo_paths,
          created_by,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      logger.info(`Added employee: ${name} (${data.id})`);
      return { success: true, data };
    } catch (error) {
      logger.error('Failed to add employee:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update employee
   */
  async updateEmployee(employeeId, updates) {
    try {
      const { data, error } = await this.client
        .from('employees')
        .update(updates)
        .eq('id', employeeId)
        .select()
        .single();

      if (error) throw error;

      logger.info(`Updated employee: ${employeeId}`);
      return { success: true, data };
    } catch (error) {
      logger.error(`Failed to update employee ${employeeId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete employee (soft delete by setting is_active = false)
   */
  async deleteEmployee(employeeId) {
    try {
      const { data, error } = await this.client
        .from('employees')
        .update({ is_active: false })
        .eq('id', employeeId)
        .select()
        .single();

      if (error) throw error;

      logger.info(`Deleted (deactivated) employee: ${employeeId}`);
      return { success: true, data };
    } catch (error) {
      logger.error(`Failed to delete employee ${employeeId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get attendance logs with filters
   */
  async getAttendanceLogs(filters = {}) {
    try {
      let query = this.client
        .from('attendance_logs')
        .select(`
          *,
          employees (
            id,
            name,
            email,
            employee_code,
            department
          )
        `)
        .order('timestamp', { ascending: false });

      // Apply filters
      if (filters.employee_id) {
        query = query.eq('employee_id', filters.employee_id);
      }

      if (filters.start_date) {
        query = query.gte('timestamp', filters.start_date);
      }

      if (filters.end_date) {
        query = query.lte('timestamp', filters.end_date);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      logger.info(`Fetched ${data.length} attendance logs`);
      return { success: true, data };
    } catch (error) {
      logger.error('Failed to fetch attendance logs:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get today's attendance
   */
  async getTodayAttendance() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.getAttendanceLogs({
      start_date: today.toISOString()
    });
  }

  /**
   * Upload employee photo to Supabase Storage
   */
  async uploadEmployeePhoto(employeeId, photoBuffer, photoIndex) {
    try {
      const fileName = `${employeeId}/photo_${photoIndex}_${Date.now()}.jpg`;

      const { data, error } = await this.client
        .storage
        .from('employee-photos')
        .upload(fileName, photoBuffer, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = this.client
        .storage
        .from('employee-photos')
        .getPublicUrl(fileName);

      logger.info(`Uploaded photo: ${fileName}`);
      return { success: true, data: { path: data.path, url: urlData.publicUrl } };
    } catch (error) {
      logger.error('Failed to upload photo:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete employee photos from storage
   */
  async deleteEmployeePhotos(photoPaths) {
    try {
      const { data, error } = await this.client
        .storage
        .from('employee-photos')
        .remove(photoPaths);

      if (error) throw error;

      logger.info(`Deleted ${photoPaths.length} photos`);
      return { success: true, data };
    } catch (error) {
      logger.error('Failed to delete photos:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get attendance statistics
   */
  async getAttendanceStatistics(startDate, endDate) {
    try {
      const { data, error } = await this.client
        .rpc('get_attendance_statistics', {
          start_date: startDate,
          end_date: endDate
        });

      if (error) throw error;

      return { success: true, data };
    } catch (error) {
      logger.error('Failed to fetch statistics:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check database connection
   */
  async checkConnection() {
    try {
      const { error } = await this.client
        .from('employees')
        .select('id')
        .limit(1);

      return !error;
    } catch (error) {
      return false;
    }
  }
}

module.exports = SupabaseSyncService;
