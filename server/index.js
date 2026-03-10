/**
 * Apollo Server - Entry Point
 * Node.js Middleware Bridge for Facial Recognition Attendance System
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express   = require('express');
const cors      = require('cors');
const logger    = require('./utils/logger');
const { connectMongoDB } = require('./config/mongodb');
const WebSocketServer    = require('./services/websocket-server');
const OfflineBufferService = require('./services/offline-buffer');
const MongoDBService     = require('./services/mongodb-service');
const AttendanceController = require('./controllers/attendance-controller');
const EmployeeController   = require('./controllers/employee-controller');
const AdminController      = require('./controllers/admin-controller');
const { MESSAGE_TYPES }    = require('./config/constants');

// HTTP routes
const authRoutes        = require('./routes/auth');
const employeeRoutes    = require('./routes/employees');
const attendanceRoutes  = require('./routes/attendance');
const branchRoutes      = require('./routes/branches');
const departmentRoutes  = require('./routes/departments');
const scheduleRoutes    = require('./routes/schedules');
const userRoutes        = require('./routes/users');
const salaryRoutes      = require('./routes/salary');
const holidayRoutes     = require('./routes/holidays');
const correctionRoutes  = require('./routes/corrections');
const tenantRoutes      = require('./routes/tenants');
const payrollRoutes     = require('./routes/payroll');
const kioskRoutes       = require('./routes/kiosk');

class ApolloServer {
  constructor() {
    this.app     = express();
    this.httpServer = null;
    this.ws      = null;
    this.offlineBuffer   = null;
    this.mongoDBService  = null;
    this.attendanceController = null;
    this.employeeController   = null;
    this.adminController      = null;
  }

  /**
   * Initialize all services
   */
  async initialize() {
    try {
      logger.info('🚀 Starting Apollo Server...');

      // 1. Connect to MongoDB
      await connectMongoDB();

      // 2. Set up Express HTTP API
      this.app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
      this.app.use(express.json({ limit: '10mb' }));
      this.app.use('/api/auth',        authRoutes);
      this.app.use('/api/employees',   employeeRoutes);
      this.app.use('/api/attendance',  attendanceRoutes);
      this.app.use('/api/branches',    branchRoutes);
      this.app.use('/api/departments', departmentRoutes);
      this.app.use('/api/schedules',   scheduleRoutes);
      this.app.use('/api/users',       userRoutes);
      this.app.use('/api/salary',      salaryRoutes);
      this.app.use('/api/holidays',    holidayRoutes);
      this.app.use('/api/corrections', correctionRoutes);
      this.app.use('/api/tenants',     tenantRoutes);
      this.app.use('/api/payroll',     payrollRoutes);
      this.app.use('/api/kiosk',       kioskRoutes);
      this.app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date() }));

      const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000');
      this.httpServer = this.app.listen(HTTP_PORT, () => {
        logger.info(`✅ HTTP API listening on http://localhost:${HTTP_PORT}`);
      });

      // 3. Initialize WebSocket server (AI + kiosk bridge)
      this.ws = new WebSocketServer();
      this.ws.start();

      // 4. Initialize MongoDB service (replaces Supabase sync)
      this.mongoDBService = new MongoDBService();
      logger.info('✅ MongoDB service initialized');

      // 5. Initialize offline buffer service (NeDB → MongoDB sync)
      this.offlineBuffer = new OfflineBufferService(this.ws);
      await this.offlineBuffer.initialize();
      logger.info('✅ Offline buffer service initialized');

      // 6. Initialize controllers
      this.attendanceController = new AttendanceController(
        this.offlineBuffer,
        this.mongoDBService,
        this.ws
      );

      this.employeeController = new EmployeeController(
        this.mongoDBService,
        this.ws
      );

      this.adminController = new AdminController(
        this.offlineBuffer,
        this.mongoDBService,
        this.ws
      );

      logger.info('✅ Controllers initialized');

      this.setupMessageHandlers();
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

    if (this.httpServer) {
      this.httpServer.close();
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
