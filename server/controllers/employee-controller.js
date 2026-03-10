/**
 * Employee Controller
 * Handles employee management operations from web clients
 */

const logger = require('../utils/logger');
const { MESSAGE_TYPES } = require('../config/constants');

class EmployeeController {
  constructor(mongoDBService, websocketServer) {
    this.mongoDBService = mongoDBService;
    this.ws = websocketServer;
  }

  /**
   * Handle ADD_EMPLOYEE command
   */
  async handleAddEmployee(clientId, message) {
    try {
      const { requestId, data } = message;

      logger.info(`Adding employee: ${data.name}`);

      // Add employee to Supabase
      const result = await this.mongoDBService.addEmployee(data, data.created_by);

      if (!result.success) {
        throw new Error(result.error);
      }

      // Send response to requester
      this.ws.sendResponse(clientId, requestId, true, result.data);

      // Broadcast employee update to all clients
      this.ws.broadcastToWebClients({
        type: MESSAGE_TYPES.EMPLOYEE_UPDATED,
        timestamp: new Date().toISOString(),
        data: {
          operation: 'add',
          employee: result.data
        }
      });

      // Notify AI engine to reload encodings
      this.ws.sendToAI({
        type: 'RELOAD_ENCODINGS',
        timestamp: new Date().toISOString()
      });

      logger.info(`Employee added successfully: ${result.data.id}`);

    } catch (error) {
      logger.error('Failed to add employee:', error.message);
      this.ws.sendResponse(clientId, message.requestId, false, null, {
        code: 'ADD_EMPLOYEE_FAILED',
        message: error.message
      });
    }
  }

  /**
   * Handle UPDATE_EMPLOYEE command
   */
  async handleUpdateEmployee(clientId, message) {
    try {
      const { requestId, data } = message;
      const { id, ...updates } = data;

      logger.info(`Updating employee: ${id}`);

      // Update employee in Supabase
      const result = await this.mongoDBService.updateEmployee(id, updates);

      if (!result.success) {
        throw new Error(result.error);
      }

      // Send response to requester
      this.ws.sendResponse(clientId, requestId, true, result.data);

      // Broadcast employee update to all clients
      this.ws.broadcastToWebClients({
        type: MESSAGE_TYPES.EMPLOYEE_UPDATED,
        timestamp: new Date().toISOString(),
        data: {
          operation: 'update',
          employee: result.data
        }
      });

      // Notify AI engine to reload encodings
      this.ws.sendToAI({
        type: 'RELOAD_ENCODINGS',
        timestamp: new Date().toISOString()
      });

      logger.info(`Employee updated successfully: ${id}`);

    } catch (error) {
      logger.error('Failed to update employee:', error.message);
      this.ws.sendResponse(clientId, message.requestId, false, null, {
        code: 'UPDATE_EMPLOYEE_FAILED',
        message: error.message
      });
    }
  }

  /**
   * Handle DELETE_EMPLOYEE command
   */
  async handleDeleteEmployee(clientId, message) {
    try {
      const { requestId, data } = message;
      const { id } = data;

      logger.info(`Deleting employee: ${id}`);

      // Delete employee from Supabase (soft delete)
      const result = await this.mongoDBService.deleteEmployee(id);

      if (!result.success) {
        throw new Error(result.error);
      }

      // Send response to requester
      this.ws.sendResponse(clientId, requestId, true, result.data);

      // Broadcast employee update to all clients
      this.ws.broadcastToWebClients({
        type: MESSAGE_TYPES.EMPLOYEE_UPDATED,
        timestamp: new Date().toISOString(),
        data: {
          operation: 'delete',
          employee: result.data
        }
      });

      // Notify AI engine to reload encodings
      this.ws.sendToAI({
        type: 'RELOAD_ENCODINGS',
        timestamp: new Date().toISOString()
      });

      logger.info(`Employee deleted successfully: ${id}`);

    } catch (error) {
      logger.error('Failed to delete employee:', error.message);
      this.ws.sendResponse(clientId, message.requestId, false, null, {
        code: 'DELETE_EMPLOYEE_FAILED',
        message: error.message
      });
    }
  }

  /**
   * Handle GET_EMPLOYEES query
   */
  async handleGetEmployees(clientId, message) {
    try {
      const { requestId } = message;

      logger.info('Fetching employees');

      // Get all active employees for this tenant (tenantId may be null on kiosk)
      const tenantId = message.tenantId || null;
      const result = await this.mongoDBService.getActiveEmployees(tenantId);

      if (!result.success) {
        throw new Error(result.error);
      }

      // Send response to requester
      this.ws.sendResponse(clientId, requestId, true, result.data);

    } catch (error) {
      logger.error('Failed to fetch employees:', error.message);
      this.ws.sendResponse(clientId, message.requestId, false, null, {
        code: 'GET_EMPLOYEES_FAILED',
        message: error.message
      });
    }
  }
}

module.exports = EmployeeController;
