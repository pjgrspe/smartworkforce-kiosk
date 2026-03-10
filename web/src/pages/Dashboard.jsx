/**
 * Dashboard Page — summary statistics and quick-access cards.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEmployees, getAttendance, getCorrections, getPayrollRuns } from '../config/api'

function StatCard({ label, value, sub, color = 'blue', onClick }) {
  const colors = {
    blue:   'bg-blue-50  border-blue-200  text-blue-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    red:    'bg-red-50   border-red-200   text-red-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  }
  return (
    <div
      onClick={onClick}
      className={`border rounded-xl p-5 cursor-pointer hover:shadow-md transition-shadow ${colors[color]}`}
    >
      <p className="text-sm font-medium opacity-70">{label}</p>
      <p className="text-4xl font-bold mt-1">{value ?? '—'}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [employees, setEmployees]     = useState([])
  const [todayLogs, setTodayLogs]     = useState([])
  const [pendingCorrections, setPending] = useState(0)
  const [payrollRuns, setPayrollRuns] = useState([])
  const [recentLogs, setRecentLogs]   = useState([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    Promise.all([
      getEmployees().catch(() => ({ data: [] })),
      getAttendance({ limit: 200 }).catch(() => ({ data: [] })),
      getCorrections({ status: 'pending' }).catch(() => ({ data: [] })),
      getPayrollRuns().catch(() => ({ data: [] }))
    ]).then(([empRes, attRes, corrRes, payRes]) => {
      const emps = empRes?.data || []
      const logs = attRes?.data || []
      const today = new Date().toDateString()

      setEmployees(emps)
      setTodayLogs(logs.filter(l => new Date(l.timestamp).toDateString() === today))
      setPending((corrRes?.data || []).length)
      setPayrollRuns(payRes?.data || [])
      setRecentLogs(logs.slice(0, 10))
    }).finally(() => setLoading(false))
  }, [])

  const lateToday = todayLogs.filter(l => l.exceptions?.isLate).length
  const presentToday = new Set(todayLogs.filter(l => l.type === 'IN').map(l =>
    typeof l.employeeId === 'object' ? l.employeeId._id : l.employeeId
  )).size

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="text-gray-500 text-lg">Loading dashboard…</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h2>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Employees"
          value={employees.length}
          color="blue"
          onClick={() => navigate('/employees')}
        />
        <StatCard
          label="Present Today"
          value={presentToday}
          sub={`of ${employees.length} active`}
          color="green"
          onClick={() => navigate('/attendance')}
        />
        <StatCard
          label="Late Today"
          value={lateToday}
          color="yellow"
          onClick={() => navigate('/attendance')}
        />
        <StatCard
          label="Pending Corrections"
          value={pendingCorrections}
          color={pendingCorrections > 0 ? 'red' : 'blue'}
          onClick={() => navigate('/corrections')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Attendance */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="font-semibold text-gray-800">Recent Attendance</h3>
            <button
              onClick={() => navigate('/attendance')}
              className="text-sm text-blue-600 hover:underline"
            >
              View all →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-2 text-xs text-gray-500 font-medium">Employee</th>
                  <th className="px-4 py-2 text-xs text-gray-500 font-medium">Time</th>
                  <th className="px-4 py-2 text-xs text-gray-500 font-medium">Type</th>
                  <th className="px-4 py-2 text-xs text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentLogs.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No logs yet</td></tr>
                ) : recentLogs.map(log => {
                  const emp = log.employeeId
                  const name = typeof emp === 'object'
                    ? `${emp.firstName} ${emp.lastName}`
                    : emp
                  return (
                    <tr key={log._id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{name}</td>
                      <td className="px-4 py-2 text-gray-500">
                        {new Date(log.timestamp).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          log.type === 'IN'  ? 'bg-green-100 text-green-700' :
                          log.type === 'OUT' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{log.type}</span>
                      </td>
                      <td className="px-4 py-2">
                        {log.exceptions?.isLate && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">Late</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payroll Runs */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="font-semibold text-gray-800">Recent Payroll Runs</h3>
            <button
              onClick={() => navigate('/payroll/runs')}
              className="text-sm text-blue-600 hover:underline"
            >
              View all →
            </button>
          </div>
          <div className="p-4 space-y-3">
            {payrollRuns.length === 0 ? (
              <div className="text-center text-gray-400 py-8">No payroll runs yet</div>
            ) : payrollRuns.slice(0, 5).map(run => (
              <div key={run._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {new Date(run.cutoffStart).toLocaleDateString()} – {new Date(run.cutoffEnd).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Net ₱{(run.totalNet || 0).toLocaleString()}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  run.status === 'finalized'         ? 'bg-green-100 text-green-700' :
                  run.status === 'approved'          ? 'bg-blue-100 text-blue-700' :
                  run.status === 'pending_approval'  ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{run.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
