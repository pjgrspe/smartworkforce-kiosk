/**
 * Kiosk Page
 * Full-screen display for employee check-ins with animations
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWebSocket } from '../contexts/WebSocketContext'
import { MESSAGE_TYPES } from '../config/websocket'

export default function Kiosk() {
  const { subscribe, syncStatus, systemStatus } = useWebSocket()
  const [recentAttendance, setRecentAttendance] = useState([])
  const [currentWelcome, setCurrentWelcome] = useState(null)

  useEffect(() => {
    // Subscribe to attendance logged events
    const unsubscribe = subscribe(MESSAGE_TYPES.ATTENDANCE_LOGGED, (message) => {
      const attendance = message.data

      // Show welcome message
      setCurrentWelcome(attendance)
      setTimeout(() => setCurrentWelcome(null), 5000)

      // Add to recent list
      setRecentAttendance(prev => [attendance, ...prev].slice(0, 10))
    })

    return unsubscribe
  }, [subscribe])

  const getConfidenceColor = (score) => {
    if (score >= 0.8) return 'text-green-400'
    if (score >= 0.6) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getConfidenceLabel = (score) => {
    if (score >= 0.8) return 'Excellent'
    if (score >= 0.6) return 'Good'
    return 'Fair'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-12">
        <h1 className="text-4xl font-bold">Apollo Attendance</h1>

        <div className="flex gap-4">
          {/* System Status */}
          <div className={`px-4 py-2 rounded-lg ${systemStatus.ai_engine === 'connected' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${systemStatus.ai_engine === 'connected' ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
              <span>AI Engine</span>
            </div>
          </div>

          {/* Sync Status */}
          <div className={`px-4 py-2 rounded-lg ${syncStatus.online ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${syncStatus.online ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`} />
              <span>{syncStatus.online ? 'Online' : 'Offline'}</span>
              {syncStatus.pending_sync_count > 0 && (
                <span className="ml-2 bg-yellow-600 px-2 py-1 rounded-full text-xs">
                  {syncStatus.pending_sync_count} pending
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Welcome Message */}
      <AnimatePresence>
        {currentWelcome && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 50 }}
            className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50"
          >
            <div className="bg-gradient-to-br from-green-500 to-blue-600 p-12 rounded-3xl shadow-2xl text-center max-w-2xl">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="text-8xl mb-6"
              >
                👋
              </motion.div>
              <h2 className="text-6xl font-bold mb-4">Welcome!</h2>
              <p className="text-4xl mb-6">{currentWelcome.employee_name}</p>
              <div className="flex items-center justify-center gap-4">
                <div className="text-xl opacity-80">
                  {new Date(currentWelcome.timestamp).toLocaleTimeString()}
                </div>
                <div className={`text-xl font-semibold ${getConfidenceColor(currentWelcome.confidence_score)}`}>
                  {getConfidenceLabel(currentWelcome.confidence_score)} Match
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent Attendance */}
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold mb-6">Recent Check-ins</h2>

        <div className="space-y-4">
          <AnimatePresence>
            {recentAttendance.map((attendance, index) => (
              <motion.div
                key={attendance.id}
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 50 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white/10 backdrop-blur-md rounded-xl p-6 flex items-center justify-between"
              >
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-2xl font-bold">
                    {attendance.employee_name?.charAt(0)}
                  </div>

                  <div>
                    <h3 className="text-2xl font-semibold">{attendance.employee_name}</h3>
                    <p className="text-gray-300">{new Date(attendance.timestamp).toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className={`text-xl font-semibold ${getConfidenceColor(attendance.confidence_score)}`}>
                    {(attendance.confidence_score * 100).toFixed(1)}%
                  </div>

                  {attendance.synced ? (
                    <div className="text-green-400">✓ Synced</div>
                  ) : (
                    <div className="text-yellow-400 animate-pulse">⏳ Pending</div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {recentAttendance.length === 0 && (
            <div className="text-center text-gray-400 py-12">
              <p className="text-2xl">No check-ins yet today</p>
              <p className="mt-2">Stand in front of the camera to check in</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-8 left-0 right-0 text-center text-gray-400">
        <p>Powered by Apollo Facial Recognition System</p>
      </div>
    </div>
  )
}
