/**
 * Admin Controller
 * Handles administrative commands from web clients
 */

const logger = require('../utils/logger');
const { MESSAGE_TYPES } = require('../config/constants');

class AdminController {
  constructor(offlineBuffer, supabaseSync, websocketServer) {
    this.offlineBuffer = offlineBuffer;
    this.supabaseSync = supabaseSync;
    this.ws = websocketServer;
  }

  /**
   * Handle GET_ATTENDANCE_LOGS query
   */
  async handleGetAttendanceLogs(clientId, message) {
    try {
      const { requestId, data } = message;

      logger.info('Fetching attendance logs');

      // Get attendance logs with filters
      const result = await this.supabaseSync.getAttendanceLogs(data || {});

      if (!result.success) {
        throw new Error(result.error);
      }

      // Send response to requester
      this.ws.sendResponse(clientId, requestId, true, result.data);

    } catch (error) {
      logger.error('Failed to fetch attendance logs:', error.message);
      this.ws.sendResponse(clientId, message.requestId, false, null, {
        code: 'GET_LOGS_FAILED',
        message: error.message
      });
    }
  }

  /**
   * Handle FORCE_SYNC command
   */
  async handleForceSync(clientId, message) {
    try {
      const { requestId } = message;

      logger.info('Force sync requested by admin');

      // Trigger force sync
      await this.offlineBuffer.forceSync();

      // Send response to requester
      this.ws.sendResponse(clientId, requestId, true, {
        message: 'Sync initiated'
      });

    } catch (error) {
      logger.error('Failed to force sync:', error.message);
      this.ws.sendResponse(clientId, message.requestId, false, null, {
        code: 'FORCE_SYNC_FAILED',
        message: error.message
      });
    }
  }
}

module.exports = AdminController;
