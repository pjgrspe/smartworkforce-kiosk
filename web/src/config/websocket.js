/**
 * WebSocket Configuration
 */

function getWsUrl() {
  if (import.meta.env.VITE_WS_URL !== undefined) {
    return import.meta.env.VITE_WS_URL || null; // empty string = disable WS
  }
  // Auto-detect from current origin (works for both dev proxy and production)
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

export const WS_CONFIG = {
  URL: getWsUrl(),
  RECONNECT_INTERVAL: 5000,
  MAX_RECONNECT_DELAY: 30000,
  HEARTBEAT_INTERVAL: 30000
}

export const MESSAGE_TYPES = {
  // From Server
  ATTENDANCE_LOGGED: 'ATTENDANCE_LOGGED',
  SYNC_STATUS: 'SYNC_STATUS',
  EMPLOYEE_UPDATED: 'EMPLOYEE_UPDATED',
  SYSTEM_STATUS: 'SYSTEM_STATUS',
  ERROR: 'ERROR',
  RESPONSE: 'RESPONSE',

  // To Server
  ADD_EMPLOYEE: 'ADD_EMPLOYEE',
  UPDATE_EMPLOYEE: 'UPDATE_EMPLOYEE',
  DELETE_EMPLOYEE: 'DELETE_EMPLOYEE',
  GET_EMPLOYEES: 'GET_EMPLOYEES',
  GET_ATTENDANCE_LOGS: 'GET_ATTENDANCE_LOGS',
  FORCE_SYNC: 'FORCE_SYNC',

  // WebSocket Protocol
  IDENTIFY: 'IDENTIFY',
  PING: 'PING',
  PONG: 'PONG'
}
