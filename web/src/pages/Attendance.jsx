/**
 * Attendance Page — logs with date/employee filters + exception badges.
 */

import { useState, useEffect, useCallback } from 'react'
import { getAttendance, getEmployees } from '../config/api'

const TYPE_BADGE = {
  IN:         'bg-green-100 text-green-700',
  OUT:        'bg-red-100 text-red-700',
  BREAK_IN:   'bg-yellow-100 text-yellow-700',
  BREAK_OUT:  'bg-blue-100 text-blue-700',
}

const SOURCE_BADGE = {
  face_kiosk:       'bg-purple-50 text-purple-700',
  web:              'bg-gray-100 text-gray-600',
  admin_correction: 'bg-orange-100 text-orange-700',
}

function Badge({ text, color }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{text}</span>
}

export default function Attendance() {
  const [logs,       setLogs]       = useState([])
  const [employees,  setEmployees]  = useState([])
  const [loading,    setLoading]    = useState(false)
  const [filters,    setFilters]    = useState({
    employeeId: '',
    from: new Date().toISOString().slice(0, 10),
    to:   new Date().toISOString().slice(0, 10)
  })
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [empRes, logRes] = await Promise.all([
        getEmployees(),
        getAttendance({
          ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
          ...(filters.from ? { start_date: filters.from } : {}),
          ...(filters.to   ? { end_date:   filters.to   } : {}),
          limit: 500
        })
      ])
      setEmployees(empRes?.data || [])
      setLogs(logRes?.data     || [])
      setPage(1)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { loadData() }, [loadData])

  const paginated = logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.ceil(logs.length / PAGE_SIZE)

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Attendance Logs</h2>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={filters.from}
            onChange={e => setFilters(p => ({ ...p, from: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={filters.to}
            onChange={e => setFilters(p => ({ ...p, to: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Employee</label>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={filters.employeeId}
            onChange={e => setFilters(p => ({ ...p, employeeId: e.target.value }))}>
            <option value="">All employees</option>
            {employees.map(e => (
              <option key={e._id} value={e._id}>{e.firstName} {e.lastName}</option>
            ))}
          </select>
        </div>
        <div className="text-sm text-gray-500 self-center">
          {logs.length} records
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Employee', 'Date', 'Time', 'Type', 'Source', 'Confidence', 'Exceptions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginated.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No logs found for selected range</td></tr>
                  ) : paginated.map(log => {
                    const emp = log.employeeId
                    const name = typeof emp === 'object'
                      ? `${emp.firstName} ${emp.lastName}`
                      : emp || '—'
                    const ts = new Date(log.timestamp)
                    const ex = log.exceptions || {}
                    return (
                      <tr key={log._id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{name}</td>
                        <td className="px-4 py-3 text-gray-600">{ts.toLocaleDateString('en-PH')}</td>
                        <td className="px-4 py-3 text-gray-600">{ts.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="px-4 py-3">
                          <Badge text={log.type} color={TYPE_BADGE[log.type] || 'bg-gray-100 text-gray-600'} />
                        </td>
                        <td className="px-4 py-3">
                          <Badge text={log.source?.replace('_', ' ') || '—'} color={SOURCE_BADGE[log.source] || 'bg-gray-100 text-gray-600'} />
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {log.confidenceScore != null ? `${(log.confidenceScore * 100).toFixed(0)}%` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {ex.isLate         && <Badge text={`Late ${ex.lateMinutes}m`}      color="bg-yellow-100 text-yellow-700" />}
                            {ex.isEarlyOut     && <Badge text={`Early ${ex.undertimeMinutes}m`} color="bg-orange-100 text-orange-700" />}
                            {ex.isMissingOut   && <Badge text="Missing OUT"                     color="bg-red-100 text-red-700" />}
                            {ex.isOvertimeCandidate && <Badge text={`OT ${ex.overtimeMinutes}m`} color="bg-blue-100 text-blue-700" />}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex gap-2 justify-center mt-4">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 border rounded text-sm disabled:opacity-40">← Prev</button>
              <span className="px-3 py-1 text-sm text-gray-600">{page} / {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 border rounded text-sm disabled:opacity-40">Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
