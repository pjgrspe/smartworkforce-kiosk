/**
 * Attendance Controller
 * Handles face detection events from AI engine and attendance logging
 */

const logger = require('../utils/logger');
const { MESSAGE_TYPES } = require('../config/constants');

class AttendanceController {
  constructor(offlineBuffer, supabaseSync, websocketServer) {
    this.offlineBuffer = offlineBuffer;
    this.supabaseSync = supabaseSync;
    this.ws = websocketServer;
  }

  /**
   * Handle FACE_DETECTED event from AI engine
   */
  async handleFaceDetected(message) {
    try {
      const { employee_id, employee_name, confidence_score } = message.data;

      logger.info(`Face detected: ${employee_name} (confidence: ${confidence_score})`);

      // Buffer attendance log locally
      const localRecord = await this.offlineBuffer.bufferAttendanceLog({
        employee_id,
        employee_name,
        timestamp: message.timestamp,
        confidence_score: parseFloat(confidence_score)
      });

      // Broadcast to web clients
      this.ws.broadcastToWebClients({
        type: MESSAGE_TYPES.ATTENDANCE_LOGGED,
        timestamp: new Date().toISOString(),
        data: {
          id: localRecord._id,
          employee_id,
          employee_name,
          confidence_score,
          timestamp: message.timestamp,
          synced: localRecord.synced
        }
      });

      logger.info(`Attendance logged: ${employee_name} at ${message.timestamp}`);

    } catch (error) {
      logger.error('Failed to handle face detection:', error.message);
      this.ws.broadcastToWebClients({
        type: MESSAGE_TYPES.ERROR,
        timestamp: new Date().toISOString(),
        error: {
          code: 'ATTENDANCE_LOG_FAILED',
          message: 'Failed to log attendance',
          details: error.message
        }
      });
    }
  }

  /**
   * Handle UNKNOWN_FACE event from AI engine
   */
  handleUnknownFace(message) {
    logger.info(`Unknown face detected (confidence: ${message.data.confidence_score})`);

    // Optionally broadcast to web clients for display
    this.ws.broadcastToWebClients({
      type: 'UNKNOWN_FACE_DETECTED',
      timestamp: new Date().toISOString(),
      data: message.data
    });
  }

  /**
   * Handle STATUS event from AI engine
   */
  handleAIStatus(message) {
    logger.debug('AI Engine status:', message.data);

    // Broadcast to web clients
    this.ws.broadcastToWebClients({
      type: MESSAGE_TYPES.SYSTEM_STATUS,
      timestamp: new Date().toISOString(),
      data: {
        ai_engine: message.data.status,
        camera_active: message.data.camera_active,
        fps: message.data.fps,
        loaded_employees: message.data.loaded_employees
      }
    });
  }

  /**
   * Handle ERROR event from AI engine
   */
  handleAIError(message) {
    logger.error('AI Engine error:', message.error);

    // Broadcast to web clients
    this.ws.broadcastToWebClients({
      type: MESSAGE_TYPES.ERROR,
      timestamp: new Date().toISOString(),
      error: message.error
    });
  }
}

module.exports = AttendanceController;
