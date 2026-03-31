/**
 * WebSocket Context
 * Manages WebSocket connection and real-time updates
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { WS_CONFIG, MESSAGE_TYPES } from '../config/websocket'
import { useAuth } from './AuthContext'

const WebSocketContext = createContext({})

export const useWebSocket = () => {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider')
  }
  return context
}

export const WebSocketProvider = ({ children }) => {
  const { user, isAdmin } = useAuth()
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState(null)
  const [syncStatus, setSyncStatus] = useState({ online: false, pending_sync_count: 0 })
  const [systemStatus, setSystemStatus] = useState({})
  const [wsAvailable, setWsAvailable] = useState(true)

  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const reconnectDelay = useRef(1000)
  const messageHandlersRef = useRef({})
  const loggedUnavailableRef = useRef(false)

  const connect = useCallback(() => {
    if (!user) return
    if (!WS_CONFIG.URL) return

    try {
      const ws = new WebSocket(WS_CONFIG.URL)

      ws.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        setWsAvailable(true)
        loggedUnavailableRef.current = false
        reconnectDelay.current = 1000

        // Identify client
        ws.send(JSON.stringify({
          type: MESSAGE_TYPES.IDENTIFY,
          clientType: isAdmin ? 'admin' : 'kiosk',
          metadata: {
            userId: user.id,
            email: user.email
          }
        }))
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          setLastMessage(message)

          // Handle specific message types
          switch (message.type) {
            case MESSAGE_TYPES.SYNC_STATUS:
              setSyncStatus(message.data)
              break

            case MESSAGE_TYPES.SYSTEM_STATUS:
              setSystemStatus(message.data)
              break

            case MESSAGE_TYPES.PING:
              ws.send(JSON.stringify({ type: MESSAGE_TYPES.PONG, timestamp: new Date().toISOString() }))
              break
          }

          // Call registered handlers
          const handlers = messageHandlersRef.current[message.type] || []
          handlers.forEach(handler => handler(message))

        } catch (err) {
          console.error('Failed to parse WebSocket message:', err)
        }
      }

      ws.onerror = (error) => {
        if (!loggedUnavailableRef.current) {
          console.warn('WebSocket unavailable; continuing without real-time updates.')
          loggedUnavailableRef.current = true
        }
        setWsAvailable(false)
      }

      ws.onclose = () => {
        if (isConnected) {
          console.log('WebSocket disconnected')
        }
        setIsConnected(false)
        wsRef.current = null

        // Reconnect with exponential backoff
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, WS_CONFIG.MAX_RECONNECT_DELAY)
          connect()
        }, reconnectDelay.current)
      }

      wsRef.current = ws

    } catch (err) {
      console.error('Failed to connect WebSocket:', err)
    }
  }, [user, isAdmin, isConnected])

  useEffect(() => {
    if (user) {
      connect()
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [user, connect])

  const send = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        ...message,
        timestamp: message.timestamp || new Date().toISOString()
      }))
      return true
    }
    return false
  }, [])

  const subscribe = useCallback((messageType, handler) => {
    if (!messageHandlersRef.current[messageType]) {
      messageHandlersRef.current[messageType] = []
    }
    messageHandlersRef.current[messageType].push(handler)

    // Return unsubscribe function
    return () => {
      messageHandlersRef.current[messageType] = messageHandlersRef.current[messageType].filter(
        h => h !== handler
      )
    }
  }, [])

  const value = {
    isConnected,
    wsAvailable,
    lastMessage,
    syncStatus,
    systemStatus,
    send,
    subscribe
  }

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>
}
