/**
 * Admin Panel Page
 * Dashboard for employee management and attendance logs
 */

import { useState, useEffect } from 'react'
import { useWebSocket } from '../contexts/WebSocketContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../config/supabase'
import { MESSAGE_TYPES } from '../config/websocket'

export default function Admin() {
  const { user, signOut } = useAuth()
  const { send, subscribe, syncStatus, systemStatus } = useWebSocket()

  const [employees, setEmployees] = useState([])
  const [attendanceLogs, setAttendanceLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')

  useEffect(() => {
    loadEmployees()
    loadAttendanceLogs()

    // Subscribe to real-time updates
    const unsubscribe = subscribe(MESSAGE_TYPES.EMPLOYEE_UPDATED, (message) => {
      loadEmployees()
    })

    return unsubscribe
  }, [subscribe])

  const loadEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (error) throw error
      setEmployees(data || [])
    } catch (err) {
      console.error('Failed to load employees:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadAttendanceLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select(`
          *,
          employees (
            name,
            email,
            employee_code
          )
        `)
        .order('timestamp', { ascending: false })
        .limit(100)

      if (error) throw error
      setAttendanceLogs(data || [])
    } catch (err) {
      console.error('Failed to load attendance logs:', err)
    }
  }

  const handleForceSync = () => {
    send({
      type: MESSAGE_TYPES.FORCE_SYNC,
      requestId: `sync_${Date.now()}`
    })
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (err) {
      console.error('Sign out failed:', err)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-2xl text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-900">Apollo Admin Panel</h1>

            <div className="flex items-center gap-4">
              {/* System Status Indicators */}
              <div className="flex gap-3">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${systemStatus.ai_engine === 'connected' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  <div className={`w-2 h-2 rounded-full ${systemStatus.ai_engine === 'connected' ? 'bg-green-600' : 'bg-red-600'} animate-pulse`} />
                  <span className="text-sm font-medium">AI</span>
                </div>

                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${syncStatus.online ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                  <div className={`w-2 h-2 rounded-full ${syncStatus.online ? 'bg-green-600' : 'bg-yellow-600'} animate-pulse`} />
                  <span className="text-sm font-medium">Database</span>
                </div>
              </div>

              <span className="text-gray-600">{user?.email}</span>

              <button
                onClick={handleSignOut}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Sign Out
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-6 flex gap-4">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('employees')}
              className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'employees' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              Employees ({employees.length})
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'attendance' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              Attendance Logs
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Total Employees</h3>
              <p className="text-4xl font-bold text-blue-600">{employees.length}</p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Today's Check-ins</h3>
              <p className="text-4xl font-bold text-green-600">
                {attendanceLogs.filter(log => {
                  const today = new Date().toDateString()
                  return new Date(log.timestamp).toDateString() === today
                }).length}
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Pending Sync</h3>
              <p className="text-4xl font-bold text-yellow-600">{syncStatus.pending_sync_count || 0}</p>
              {syncStatus.pending_sync_count > 0 && (
                <button
                  onClick={handleForceSync}
                  className="mt-4 px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm"
                >
                  Force Sync
                </button>
              )}
            </div>
          </div>
        )}

        {/* Employees Tab */}
        {activeTab === 'employees' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-semibold">Employee List</h2>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Add Employee
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {employees.map(employee => (
                    <tr key={employee.id}>
                      <td className="px-6 py-4">{employee.name}</td>
                      <td className="px-6 py-4">{employee.email}</td>
                      <td className="px-6 py-4">{employee.department || '-'}</td>
                      <td className="px-6 py-4">{employee.position || '-'}</td>
                      <td className="px-6 py-4">
                        <button className="text-blue-600 hover:underline mr-3">Edit</button>
                        <button className="text-red-600 hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Attendance Tab */}
        {activeTab === 'attendance' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Attendance Logs</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {attendanceLogs.map(log => (
                    <tr key={log.id}>
                      <td className="px-6 py-4">{log.employees?.name || 'Unknown'}</td>
                      <td className="px-6 py-4">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className={`font-semibold ${log.confidence_score >= 0.8 ? 'text-green-600' : log.confidence_score >= 0.6 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {(log.confidence_score * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {log.synced ? (
                          <span className="text-green-600">✓ Synced</span>
                        ) : (
                          <span className="text-yellow-600">⏳ Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
