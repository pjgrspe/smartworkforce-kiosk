/**
 * Configuration Constants for SmartWorkforce Server
 */

module.exports = {
  // WebSocket Configuration
  WS_HEARTBEAT_INTERVAL: 30000, // 30 seconds

  // Client Types
  CLIENT_TYPES: {
    AI_ENGINE: 'ai-engine',
    WEB_CLIENT: 'web-client',
    ADMIN: 'admin',
    KIOSK: 'kiosk'
  },

  // Message Types
  MESSAGE_TYPES: {
    // From AI Engine
    FACE_DETECTED: 'FACE_DETECTED',
    NO_FACE_DETECTED: 'NO_FACE_DETECTED',
    UNKNOWN_FACE: 'UNKNOWN_FACE',
    ERROR: 'ERROR',
    STATUS: 'STATUS',

    // From/To Web Client
    ATTENDANCE_LOGGED: 'ATTENDANCE_LOGGED',
    SYNC_STATUS: 'SYNC_STATUS',
    EMPLOYEE_UPDATED: 'EMPLOYEE_UPDATED',
    SYSTEM_STATUS: 'SYSTEM_STATUS',

    // Commands from Web Client
    ADD_EMPLOYEE: 'ADD_EMPLOYEE',
    UPDATE_EMPLOYEE: 'UPDATE_EMPLOYEE',
    DELETE_EMPLOYEE: 'DELETE_EMPLOYEE',
    GET_ATTENDANCE_LOGS: 'GET_ATTENDANCE_LOGS',
    GET_EMPLOYEES: 'GET_EMPLOYEES',
    FORCE_SYNC: 'FORCE_SYNC',

    // Responses
    RESPONSE: 'RESPONSE',

    // WebSocket Protocol
    PING: 'PING',
    PONG: 'PONG',
    IDENTIFY: 'IDENTIFY'
  },

  // Sync Configuration
  SYNC_CONFIG: {
    RETRY_DELAY_MS: parseInt(process.env.SYNC_RETRY_DELAY_MS || '5000'),
    MAX_RETRIES: parseInt(process.env.SYNC_MAX_RETRIES || '5'),
    CONNECTIVITY_CHECK_INTERVAL_MS: parseInt(process.env.CONNECTIVITY_CHECK_INTERVAL_MS || '10000'),
    BATCH_SIZE: 10
  },

  // Face Recognition Configuration
  RECOGNITION_CONFIG: {
    CONFIDENCE_THRESHOLD: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.6'),
    COOLDOWN_MINUTES: parseInt(process.env.RECOGNITION_COOLDOWN_MINUTES || '5')
  },

  // Logging Configuration
  LOG_CONFIG: {
    LEVEL: process.env.LOG_LEVEL || 'info',
    FILE_PATH: process.env.LOG_FILE_PATH || 'logs/smartworkforce.log',
    MAX_SIZE: parseInt(process.env.LOG_MAX_SIZE || '10485760'), // 10MB
    MAX_FILES: parseInt(process.env.LOG_MAX_FILES || '30')
  }
};
