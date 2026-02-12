/**
 * WebSocket Server
 * Central communication hub for Apollo system
 * Handles connections from Python AI engine and React web clients
 */

const WebSocket = require('ws');
const logger = require('../utils/logger');
const { WS_PORT, WS_HOST, MESSAGE_TYPES, CLIENT_TYPES, WS_HEARTBEAT_INTERVAL } = require('../config/constants');

class WebSocketServer {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // clientId -> { ws, type, metadata }
    this.aiEngineClient = null;
    this.webClients = new Set();
  }

  /**
   * Initialize and start the WebSocket server
   */
  start() {
    this.wss = new WebSocket.Server({
      port: WS_PORT,
      host: WS_HOST
    });

    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      logger.info(`New WebSocket connection: ${clientId} from ${req.socket.remoteAddress}`);

      // Store client temporarily until identified
      this.clients.set(clientId, {
        ws,
        type: 'unknown',
        id: clientId,
        connectedAt: new Date(),
        isAlive: true
      });

      // Set up event handlers
      ws.on('message', (message) => this.handleMessage(clientId, message));
      ws.on('close', () => this.handleClose(clientId));
      ws.on('error', (error) => this.handleError(clientId, error));
      ws.on('pong', () => this.handlePong(clientId));

      // Send identification request
      this.send(ws, {
        type: MESSAGE_TYPES.IDENTIFY,
        timestamp: new Date().toISOString(),
        message: 'Please identify your client type'
      });
    });

    // Set up heartbeat interval
    this.heartbeatInterval = setInterval(() => {
      this.heartbeat();
    }, WS_HEARTBEAT_INTERVAL);

    logger.info(`WebSocket server started on ws://${WS_HOST}:${WS_PORT}`);
  }

  /**
   * Handle incoming messages from clients
   */
  handleMessage(clientId, rawMessage) {
    try {
      const message = JSON.parse(rawMessage.toString());
      const client = this.clients.get(clientId);

      if (!client) {
        logger.warn(`Message from unknown client: ${clientId}`);
        return;
      }

      logger.debug(`[${client.type}] ${message.type}: ${JSON.stringify(message).substring(0, 100)}`);

      // Handle identification
      if (message.type === MESSAGE_TYPES.IDENTIFY) {
        this.identifyClient(clientId, message.clientType, message.metadata);
        return;
      }

      // Handle pong responses
      if (message.type === MESSAGE_TYPES.PONG) {
        client.isAlive = true;
        return;
      }

      // Route message based on sender type
      if (client.type === CLIENT_TYPES.AI_ENGINE) {
        this.handleAIMessage(clientId, message);
      } else if (client.type === CLIENT_TYPES.WEB_CLIENT ||
                 client.type === CLIENT_TYPES.ADMIN ||
                 client.type === CLIENT_TYPES.KIOSK) {
        this.handleWebMessage(clientId, message);
      }
    } catch (error) {
      logger.error(`Error handling message from ${clientId}: ${error.message}`);
      logger.error(error.stack);
    }
  }

  /**
   * Identify client type and update metadata
   */
  identifyClient(clientId, clientType, metadata = {}) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.type = clientType;
    client.metadata = metadata;

    logger.info(`Client ${clientId} identified as ${clientType}`);

    // Update specialized client references
    if (clientType === CLIENT_TYPES.AI_ENGINE) {
      this.aiEngineClient = clientId;
      logger.info('AI Engine connected');
    } else if ([CLIENT_TYPES.WEB_CLIENT, CLIENT_TYPES.ADMIN, CLIENT_TYPES.KIOSK].includes(clientType)) {
      this.webClients.add(clientId);
      logger.info(`Web client connected (${clientType}), total: ${this.webClients.size}`);
    }

    // Send acknowledgment
    this.send(client.ws, {
      type: MESSAGE_TYPES.RESPONSE,
      success: true,
      message: `Identified as ${clientType}`,
      timestamp: new Date().toISOString()
    });

    // Broadcast system status update
    this.broadcastSystemStatus();
  }

  /**
   * Handle messages from AI engine
   */
  handleAIMessage(clientId, message) {
    // Emit event for controllers to handle
    this.emit('ai-message', message);

    // Broadcast certain messages to web clients
    if ([MESSAGE_TYPES.FACE_DETECTED, MESSAGE_TYPES.STATUS, MESSAGE_TYPES.ERROR].includes(message.type)) {
      this.broadcastToWebClients(message);
    }
  }

  /**
   * Handle messages from web clients
   */
  handleWebMessage(clientId, message) {
    // Emit event for controllers to handle
    this.emit('web-message', { clientId, message });
  }

  /**
   * Handle client disconnection
   */
  handleClose(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    logger.info(`Client disconnected: ${clientId} (${client.type})`);

    // Update specialized client references
    if (client.type === CLIENT_TYPES.AI_ENGINE) {
      this.aiEngineClient = null;
      logger.warn('AI Engine disconnected');
    } else if (this.webClients.has(clientId)) {
      this.webClients.delete(clientId);
      logger.info(`Web client disconnected, remaining: ${this.webClients.size}`);
    }

    this.clients.delete(clientId);

    // Broadcast system status update
    this.broadcastSystemStatus();
  }

  /**
   * Handle client errors
   */
  handleError(clientId, error) {
    const client = this.clients.get(clientId);
    logger.error(`WebSocket error for ${clientId} (${client?.type || 'unknown'}): ${error.message}`);
  }

  /**
   * Handle pong response
   */
  handlePong(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      client.isAlive = true;
    }
  }

  /**
   * Heartbeat to detect dead connections
   */
  heartbeat() {
    this.clients.forEach((client, clientId) => {
      if (!client.isAlive) {
        logger.warn(`Client ${clientId} (${client.type}) failed heartbeat, terminating`);
        client.ws.terminate();
        return;
      }

      client.isAlive = false;
      client.ws.ping();
    });
  }

  /**
   * Send message to specific client
   */
  send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  /**
   * Send message to AI engine
   */
  sendToAI(message) {
    if (!this.aiEngineClient) {
      logger.warn('Cannot send to AI engine: not connected');
      return false;
    }

    const client = this.clients.get(this.aiEngineClient);
    return this.send(client.ws, message);
  }

  /**
   * Broadcast message to all web clients
   */
  broadcastToWebClients(message) {
    let sentCount = 0;
    this.webClients.forEach(clientId => {
      const client = this.clients.get(clientId);
      if (client && this.send(client.ws, message)) {
        sentCount++;
      }
    });
    logger.debug(`Broadcast to ${sentCount} web clients: ${message.type}`);
  }

  /**
   * Broadcast to all clients
   */
  broadcast(message) {
    this.clients.forEach((client) => {
      this.send(client.ws, message);
    });
  }

  /**
   * Send response to specific client
   */
  sendResponse(clientId, requestId, success, data = null, error = null) {
    const client = this.clients.get(clientId);
    if (!client) return false;

    return this.send(client.ws, {
      type: MESSAGE_TYPES.RESPONSE,
      requestId,
      success,
      data,
      error,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast system status to all clients
   */
  broadcastSystemStatus() {
    const status = {
      type: MESSAGE_TYPES.SYSTEM_STATUS,
      timestamp: new Date().toISOString(),
      data: {
        ai_engine: this.aiEngineClient ? 'connected' : 'disconnected',
        web_clients: this.webClients.size,
        uptime: process.uptime()
      }
    };

    this.broadcastToWebClients(status);
  }

  /**
   * Generate unique client ID
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Event emitter functionality
   */
  emit(event, data) {
    if (this.eventHandlers && this.eventHandlers[event]) {
      this.eventHandlers[event].forEach(handler => handler(data));
    }
  }

  on(event, handler) {
    if (!this.eventHandlers) {
      this.eventHandlers = {};
    }
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  /**
   * Shutdown server gracefully
   */
  shutdown() {
    logger.info('Shutting down WebSocket server...');

    clearInterval(this.heartbeatInterval);

    // Close all client connections
    this.clients.forEach((client, clientId) => {
      client.ws.close(1000, 'Server shutting down');
    });

    // Close server
    this.wss.close(() => {
      logger.info('WebSocket server shut down');
    });
  }
}

module.exports = WebSocketServer;
