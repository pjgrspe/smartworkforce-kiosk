/**
 * Apollo Server - Entry Point
 * Node.js Middleware Bridge for Facial Recognition Attendance System
 */

require('dotenv').config({ path: '../.env' });

const logger = require('./utils/logger');
const WebSocketServer = require('./services/websocket-server');
const OfflineBufferService = require('./services/offline-buffer');
const SupabaseSyncService = require('./services/supabase-sync');
const AttendanceController = require('./controllers/attendance-controller');
const EmployeeController = require('./controllers/employee-controller');
const AdminController = require('./controllers/admin-controller');
const { MESSAGE_TYPES } = require('./config/constants');

class ApolloServer {
  constructor() {
    this.ws = null;
    this.offlineBuffer = null;
    this.supabaseSync = null;
    this.attendanceController = null;
    this.employeeController = null;
    this.adminController = null;
  }

  /**
   * Initialize all services
   */
  async initialize() {
    try {
      logger.info('🚀 Starting Apollo Server...');

      // Initialize WebSocket server
      this.ws = new WebSocketServer();
      this.ws.start();

      // Initialize Supabase sync service
      this.supabaseSync = new SupabaseSyncService();
      logger.info('✅ Supabase sync service initialized');

      // Initialize offline buffer service
      this.offlineBuffer = new OfflineBufferService(this.ws);
      await this.offlineBuffer.initialize();
      logger.info('✅ Offline buffer service initialized');

      // Initialize controllers
      this.attendanceController = new AttendanceController(
        this.offlineBuffer,
        this.supabaseSync,
        this.ws
      );

      this.employeeController = new EmployeeController(
        this.supabaseSync,
        this.ws
      );

      this.adminController = new AdminController(
        this.offlineBuffer,
        this.supabaseSync,
        this.ws
      );

      logger.info('✅ Controllers initialized');

      // Set up message routing
      this.setupMessageHandlers();

      // Set up cleanup job (daily at midnight)
      this.setupDailyCleanup();

      logger.info('✅ Apollo Server started successfully');
      logger.info(`📡 WebSocket server listening on ws://localhost:${process.env.WS_PORT || 8080}`);

    } catch (error) {
      logger.error('Failed to start Apollo Server:', error);
      process.exit(1);
    }
  }

  /**
   * Set up message handlers for WebSocket events
   */
  setupMessageHandlers() {
    // Handle messages from AI engine
    this.ws.on('ai-message', (message) => {
      switch (message.type) {
        case MESSAGE_TYPES.FACE_DETECTED:
          this.attendanceController.handleFaceDetected(message);
          break;

        case MESSAGE_TYPES.UNKNOWN_FACE:
          this.attendanceController.handleUnknownFace(message);
          break;

        case MESSAGE_TYPES.STATUS:
          this.attendanceController.handleAIStatus(message);
          break;

        case MESSAGE_TYPES.ERROR:
          this.attendanceController.handleAIError(message);
          break;

        default:
          logger.warn(`Unknown AI message type: ${message.type}`);
      }
    });

    // Handle messages from web clients
    this.ws.on('web-message', ({ clientId, message }) => {
      switch (message.type) {
        // Employee management
        case MESSAGE_TYPES.ADD_EMPLOYEE:
          this.employeeController.handleAddEmployee(clientId, message);
          break;

        case MESSAGE_TYPES.UPDATE_EMPLOYEE:
          this.employeeController.handleUpdateEmployee(clientId, message);
          break;

        case MESSAGE_TYPES.DELETE_EMPLOYEE:
          this.employeeController.handleDeleteEmployee(clientId, message);
          break;

        case MESSAGE_TYPES.GET_EMPLOYEES:
          this.employeeController.handleGetEmployees(clientId, message);
          break;

        // Admin operations
        case MESSAGE_TYPES.GET_ATTENDANCE_LOGS:
          this.adminController.handleGetAttendanceLogs(clientId, message);
          break;

        case MESSAGE_TYPES.FORCE_SYNC:
          this.adminController.handleForceSync(clientId, message);
          break;

        default:
          logger.warn(`Unknown web message type: ${message.type}`);
          this.ws.sendResponse(clientId, message.requestId, false, null, {
            code: 'UNKNOWN_MESSAGE_TYPE',
            message: `Unknown message type: ${message.type}`
          });
      }
    });
  }

  /**
   * Set up daily cleanup job
   */
  setupDailyCleanup() {
    // Calculate time until midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const timeUntilMidnight = tomorrow - now;

    // Schedule first cleanup at midnight
    setTimeout(() => {
      this.runDailyCleanup();

      // Then run every 24 hours
      setInterval(() => {
        this.runDailyCleanup();
      }, 24 * 60 * 60 * 1000);
    }, timeUntilMidnight);

    logger.info(`Daily cleanup scheduled for ${tomorrow.toISOString()}`);
  }

  /**
   * Run daily cleanup tasks
   */
  async runDailyCleanup() {
    logger.info('Running daily cleanup...');

    try {
      // Cleanup old synced records from NeDB
      await this.offlineBuffer.cleanupOldRecords();

      logger.info('✅ Daily cleanup completed');
    } catch (error) {
      logger.error('Daily cleanup failed:', error);
    }
  }

  /**
   * Graceful shutdown
   */
  shutdown() {
    logger.info('Shutting down Apollo Server...');

    if (this.offlineBuffer) {
      this.offlineBuffer.shutdown();
    }

    if (this.ws) {
      this.ws.shutdown();
    }

    logger.info('Apollo Server shut down successfully');
    process.exit(0);
  }
}

// Create and start server
const server = new ApolloServer();
server.initialize();

// Handle graceful shutdown
process.on('SIGINT', () => server.shutdown());
process.on('SIGTERM', () => server.shutdown());

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  server.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
});

module.exports = server;
