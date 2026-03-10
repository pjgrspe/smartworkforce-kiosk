/**
 * Offline Buffer Service
 * Manages local NeDB storage and syncs with Supabase when online
 * Implements offline-first architecture with queue-based sync
 */

const Datastore = require('@seald-io/nedb');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { SYNC_CONFIG, NEDB_CONFIG } = require('../config/constants');
const MongoDBService = require('./mongodb-service');

const mongoService = new MongoDBService();

class OfflineBufferService {
  constructor(websocketServer) {
    this.ws = websocketServer;
    this.db = null;
    this.syncQueue = [];
    this.isSyncing = false;
    this.isOnline = false;
    this.retryAttempts = 0;
    this.connectivityCheckInterval = null;
    this.syncTimeout = null;
  }

  /**
   * Initialize NeDB database
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new Datastore({
        filename: path.join(__dirname, '../db/local.db'),
        autoload: true,
        timestampData: true,
        autoCompactionInterval: NEDB_CONFIG.COMPACTION_INTERVAL_MS
      });

      this.db.loadDatabase((err) => {
        if (err) {
          logger.error('Failed to load NeDB database:', err);
          reject(err);
        } else {
          logger.info('NeDB database loaded successfully');

          // Load unsynced records into queue
          this.loadUnsyncedRecords();

          // Start connectivity monitor
          this.startConnectivityMonitor();

          resolve();
        }
      });
    });
  }

  /**
   * Load unsynced records from database into sync queue
   */
  loadUnsyncedRecords() {
    this.db.find({ synced: false }, (err, docs) => {
      if (err) {
        logger.error('Failed to load unsynced records:', err);
        return;
      }

      this.syncQueue = docs.map(doc => doc._id);
      logger.info(`Loaded ${this.syncQueue.length} unsynced records into sync queue`);

      if (this.syncQueue.length > 0) {
        this.triggerSync();
      }
    });
  }

  /**
   * Buffer attendance log locally
   */
  async bufferAttendanceLog(attendanceData) {
    return new Promise((resolve, reject) => {
      const localId = uuidv4();

      const localRecord = {
        _id: localId,
        employee_id: attendanceData.employee_id,
        employee_name: attendanceData.employee_name,
        timestamp: attendanceData.timestamp || new Date().toISOString(),
        confidence_score: attendanceData.confidence_score,
        synced: false,
        sync_attempts: 0,
        created_at: new Date().toISOString()
      };

      this.db.insert(localRecord, (err, doc) => {
        if (err) {
          logger.error('Failed to buffer attendance log:', err);
          reject(err);
          return;
        }

        logger.info(`Buffered attendance log: ${localId} for employee ${attendanceData.employee_name}`);

        // Add to sync queue
        this.syncQueue.push(localId);

        // Attempt immediate sync if online
        if (this.isOnline) {
          this.triggerSync();
        }

        resolve(doc);
      });
    });
  }

  /**
   * Start connectivity monitoring
   */
  startConnectivityMonitor() {
    logger.info('Starting connectivity monitor...');

    // Initial check
    this.checkConnectivity();

    // Periodic checks
    this.connectivityCheckInterval = setInterval(() => {
      this.checkConnectivity();
    }, SYNC_CONFIG.CONNECTIVITY_CHECK_INTERVAL_MS);
  }

  /**
   * Check if MongoDB is reachable
   */
  async checkConnectivity() {
    try {
      const online = await mongoService.isOnline();

      const wasOnline = this.isOnline;
      this.isOnline = online;

      if (!wasOnline && this.isOnline) {
        logger.info('✅ Connection to MongoDB restored');
        this.retryAttempts = 0;
        this.triggerSync();
      }

      if (wasOnline && !this.isOnline) {
        logger.warn('❌ Connection to MongoDB lost - entering offline mode');
      }

      this.broadcastSyncStatus();
    } catch (err) {
      this.isOnline = false;
      logger.debug('Connectivity check failed:', err.message);
    }
  }

  /**
   * Trigger sync process (debounced)
   */
  triggerSync() {
    if (this.isSyncing || this.syncQueue.length === 0 || !this.isOnline) {
      return;
    }

    // Debounce: wait 2 seconds before syncing
    clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => {
      this.performSync();
    }, 2000);
  }

  /**
   * Perform sync to Supabase
   */
  async performSync() {
    if (!this.isOnline || this.isSyncing) {
      return;
    }

    this.isSyncing = true;
    const totalRecords = this.syncQueue.length;
    logger.info(`🔄 Starting sync: ${totalRecords} records in queue`);

    this.broadcastSyncStatus({ sync_in_progress: true });

    // Process queue in batches
    const batch = this.syncQueue.splice(0, SYNC_CONFIG.BATCH_SIZE);
    let successCount = 0;
    let failCount = 0;

    for (const localId of batch) {
      try {
        // Get local record
        const localRecord = await this.getRecord(localId);

        if (!localRecord) {
          logger.warn(`Record ${localId} not found in local database`);
          continue;
        }

        // Upsert to MongoDB (idempotent via localId)
        const result = await mongoService.insertAttendanceLog({
          employeeId:      localRecord.employee_id,
          tenantId:        localRecord.tenant_id || null,
          branchId:        localRecord.branch_id || null,
          timestamp:       new Date(localRecord.timestamp),
          type:            localRecord.type || 'IN',
          source:          'face_kiosk',
          confidenceScore: localRecord.confidence_score,
          localId
        });

        if (!result.success) {
          throw new Error(result.error);
        }

        // Mark as synced in local DB
        await this.markAsSynced(localId, result.data._id.toString());
        successCount++;

        logger.info(`✅ Synced ${localId} -> ${result.data._id}`);

        // Broadcast to web clients
        this.ws.broadcastToWebClients({
          type: 'ATTENDANCE_LOGGED',
          timestamp: new Date().toISOString(),
          data: {
            id:              result.data._id,
            employee_id:     localRecord.employee_id,
            employee_name:   localRecord.employee_name,
            confidence_score:localRecord.confidence_score,
            timestamp:       localRecord.timestamp,
            synced:          true
          }
        });

      } catch (err) {
        failCount++;
        logger.error(`Failed to sync ${localId}:`, err.message);

        // Increment retry attempts
        await this.incrementSyncAttempts(localId);

        // Check if max retries exceeded
        const record = await this.getRecord(localId);
        if (record && record.sync_attempts < SYNC_CONFIG.MAX_RETRIES) {
          // Re-queue for retry
          this.syncQueue.push(localId);
        } else {
          logger.error(`Max retries exceeded for ${localId}, manual intervention needed`);
          // TODO: Alert admin
        }
      }
    }

    this.isSyncing = false;

    logger.info(`Sync completed: ${successCount} success, ${failCount} failed, ${this.syncQueue.length} remaining`);

    // Continue syncing if queue not empty
    if (this.syncQueue.length > 0 && this.isOnline) {
      setTimeout(() => this.triggerSync(), SYNC_CONFIG.RETRY_DELAY_MS);
    }

    this.broadcastSyncStatus({ sync_in_progress: false });
  }

  /**
   * Get record from local database
   */
  getRecord(localId) {
    return new Promise((resolve, reject) => {
      this.db.findOne({ _id: localId }, (err, doc) => {
        if (err) reject(err);
        else resolve(doc);
      });
    });
  }

  /**
   * Mark record as synced
   */
  markAsSynced(localId, supabaseId = null) {
    return new Promise((resolve, reject) => {
      this.db.update(
        { _id: localId },
        {
          $set: {
            synced: true,
            synced_at: new Date().toISOString(),
            supabase_id: supabaseId
          }
        },
        {},
        (err, numReplaced) => {
          if (err) reject(err);
          else resolve(numReplaced);
        }
      );
    });
  }

  /**
   * Increment sync attempts counter
   */
  incrementSyncAttempts(localId) {
    return new Promise((resolve, reject) => {
      this.db.update(
        { _id: localId },
        { $inc: { sync_attempts: 1 } },
        {},
        (err, numReplaced) => {
          if (err) reject(err);
          else resolve(numReplaced);
        }
      );
    });
  }

  /**
   * Get pending sync count
   */
  getPendingSyncCount() {
    return new Promise((resolve, reject) => {
      this.db.count({ synced: false }, (err, count) => {
        if (err) reject(err);
        else resolve(count);
      });
    });
  }

  /**
   * Force sync (admin command)
   */
  async forceSync() {
    logger.info('Force sync requested');

    // Reload unsynced records into queue
    this.loadUnsyncedRecords();

    // Reset retry attempts
    this.retryAttempts = 0;

    // Trigger sync
    this.triggerSync();
  }

  /**
   * Broadcast sync status to web clients
   */
  async broadcastSyncStatus(additionalData = {}) {
    const pendingCount = await this.getPendingSyncCount();

    this.ws.broadcastToWebClients({
      type: 'SYNC_STATUS',
      timestamp: new Date().toISOString(),
      data: {
        online: this.isOnline,
        pending_sync_count: pendingCount,
        sync_in_progress: this.isSyncing,
        ...additionalData
      }
    });
  }

  /**
   * Cleanup old synced records (run daily)
   */
  async cleanupOldRecords() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - NEDB_CONFIG.RETENTION_DAYS);

    return new Promise((resolve, reject) => {
      this.db.remove(
        {
          synced: true,
          synced_at: { $lt: cutoffDate.toISOString() }
        },
        { multi: true },
        (err, numRemoved) => {
          if (err) {
            logger.error('Failed to cleanup old records:', err);
            reject(err);
          } else {
            logger.info(`Cleaned up ${numRemoved} old synced records`);
            resolve(numRemoved);
          }
        }
      );
    });
  }

  /**
   * Shutdown service
   */
  shutdown() {
    logger.info('Shutting down offline buffer service...');

    if (this.connectivityCheckInterval) {
      clearInterval(this.connectivityCheckInterval);
    }

    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }

    // Compact database before shutdown
    if (this.db) {
      this.db.persistence.compactDatafile();
    }
  }
}

module.exports = OfflineBufferService;
