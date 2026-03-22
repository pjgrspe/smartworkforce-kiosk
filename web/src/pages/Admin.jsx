/**
 * Admin Panel Page
 * Dashboard for employee management and attendance logs
 */

import { useState, useEffect } from 'react'
import { useWebSocket } from '../contexts/WebSocketContext'
import { useAuth } from '../contexts/AuthContext'
import { getEmployees, getAttendance } from '../config/api'
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
      const res = await getEmployees()
      setEmployees(res?.data || [])
    } catch (err) {
      console.error('Failed to load employees:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadAttendanceLogs = async () => {
    try {
      const res = await getAttendance({ limit: 100 })
      setAttendanceLogs(res?.data || [])
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
      <div className="min-h-screen bg-navy-900 flex items-center justify-center">
        <div className="text-sm text-navy-300 uppercase tracking-wider">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-navy-900 text-navy-100">
      {/* Header */}
      <header className="bg-navy-800 border-b border-navy-500">
        <div className="max-w-7xl mx-auto px-6 py-3.5">
          <div className="flex justify-between items-center">
            <h1 className="text-sm font-semibold uppercase tracking-wider text-navy-50">Aquino Bistro Group Admin Panel</h1>

            <div className="flex items-center gap-4">
              {/* System Status Indicators */}
              <div className="flex gap-3">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${systemStatus.ai_engine === 'connected' ? 'bg-signal-success/10 text-signal-success border-signal-success/25' : 'bg-signal-danger/10 text-signal-danger border-signal-danger/25'}`}>
                  <div className={`w-2 h-2 rounded-full ${systemStatus.ai_engine === 'connected' ? 'bg-signal-success' : 'bg-signal-danger'} animate-pulse`} />
                  <span className="text-2xs font-semibold uppercase tracking-wider">AI</span>
                </div>

                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${syncStatus.online ? 'bg-signal-success/10 text-signal-success border-signal-success/25' : 'bg-signal-warning/10 text-signal-warning border-signal-warning/25'}`}>
                  <div className={`w-2 h-2 rounded-full ${syncStatus.online ? 'bg-signal-success' : 'bg-signal-warning'} animate-pulse`} />
                  <span className="text-2xs font-semibold uppercase tracking-wider">Database</span>
                </div>
              </div>

              <span className="text-navy-300 text-xs">{user?.email}</span>

              <button
                onClick={handleSignOut}
                className="px-4 py-2 bg-signal-danger text-white rounded-md hover:opacity-90 text-xs font-medium"
              >
                Sign Out
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-3 flex gap-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 h-7 rounded-md text-xs font-medium uppercase tracking-wider transition-colors duration-80 ${activeTab === 'dashboard' ? 'bg-accent text-white' : 'text-navy-300 hover:text-navy-100 hover:bg-navy-700'}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('employees')}
              className={`px-4 h-7 rounded-md text-xs font-medium uppercase tracking-wider transition-colors duration-80 ${activeTab === 'employees' ? 'bg-accent text-white' : 'text-navy-300 hover:text-navy-100 hover:bg-navy-700'}`}
            >
              Employees ({employees.length})
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              className={`px-4 h-7 rounded-md text-xs font-medium uppercase tracking-wider transition-colors duration-80 ${activeTab === 'attendance' ? 'bg-accent text-white' : 'text-navy-300 hover:text-navy-100 hover:bg-navy-700'}`}
            >
              Attendance Logs
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="table-shell p-6">
              <h3 className="label-caps mb-2">Total Employees</h3>
              <p className="text-4xl font-bold text-accent-400">{employees.length}</p>
            </div>

            <div className="table-shell p-6">
              <h3 className="label-caps mb-2">Today's Check-ins</h3>
              <p className="text-4xl font-bold text-signal-success">
                {attendanceLogs.filter(log => {
                  const today = new Date().toDateString()
                  return new Date(log.timestamp).toDateString() === today
                }).length}
              </p>
            </div>

            <div className="table-shell p-6">
              <h3 className="label-caps mb-2">Pending Sync</h3>
              <p className="text-4xl font-bold text-signal-warning">{syncStatus.pending_sync_count || 0}</p>
              {syncStatus.pending_sync_count > 0 && (
                <button
                  onClick={handleForceSync}
                  className="mt-4 px-4 py-2 bg-signal-warning text-navy-950 rounded-md hover:opacity-90 text-xs font-medium"
                >
                  Force Sync
                </button>
              )}
            </div>
          </div>
        )}

        {/* Employees Tab */}
        {activeTab === 'employees' && (
          <div className="table-shell">
            <div className="p-6 border-b border-navy-500 flex justify-between items-center bg-navy-800">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-navy-100">Employee List</h2>
              <button className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-400 text-xs font-medium">
                Add Employee
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="table-base">
                <thead className="table-head-row">
                  <tr>
                    <th className="table-th">Name</th>
                    <th className="table-th">Email</th>
                    <th className="table-th">Department</th>
                    <th className="table-th">Position</th>
                    <th className="table-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee, i) => (
                    <tr key={employee._id} className={`table-row ${i % 2 !== 0 ? 'table-row-alt' : ''}`}>
                      <td className="px-4 py-2.5">{[employee.firstName, employee.lastName].filter(Boolean).join(' ')}</td>
                      <td className="px-4 py-2.5 text-navy-300">{employee.email || '-'}</td>
                      <td className="px-4 py-2.5 text-navy-300">{employee.departmentId?.name || '-'}</td>
                      <td className="px-4 py-2.5 text-navy-300">{employee.employment?.position || '-'}</td>
                      <td className="px-4 py-2.5">
                        <button className="text-accent hover:text-accent-200 mr-3 text-2xs">Edit</button>
                        <button className="text-signal-danger hover:opacity-90 text-2xs">Delete</button>
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
          <div className="table-shell">
            <div className="p-6 border-b border-navy-500 bg-navy-800">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-navy-100">Attendance Logs</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="table-base">
                <thead className="table-head-row">
                  <tr>
                    <th className="table-th">Employee</th>
                    <th className="table-th">Time</th>
                    <th className="table-th">Confidence</th>
                    <th className="table-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceLogs.map((log, i) => (
                    <tr key={log._id} className={`table-row ${i % 2 !== 0 ? 'table-row-alt' : ''}`}>
                      <td className="px-4 py-2.5">
                        {log.employeeId
                          ? `${log.employeeId.firstName || ''} ${log.employeeId.lastName || ''}`.trim() || log.employeeId.employeeCode
                          : 'Unknown'}
                      </td>
                      <td className="px-4 py-2.5 text-navy-300">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-semibold ${log.confidenceScore >= 0.8 ? 'text-signal-success' : log.confidenceScore >= 0.6 ? 'text-signal-warning' : 'text-signal-danger'}`}>
                          {log.confidenceScore != null ? `${(log.confidenceScore * 100).toFixed(1)}%` : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {log.synced ? (
                          <span className="text-signal-success text-2xs">Synced</span>
                        ) : (
                          <span className="text-signal-warning text-2xs">Pending</span>
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
