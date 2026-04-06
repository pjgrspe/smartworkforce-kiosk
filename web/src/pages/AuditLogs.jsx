import { useState, useEffect, useCallback } from 'react'
import { getAuditLogs } from '../config/api'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'

const TABLE_LABELS = {
  employees:         'Employees',
  users:             'Users',
  salary_structures: 'Salary',
  attendance:        'Attendance',
  leaves:            'Leaves',
  corrections:       'Corrections',
}

const OP_VARIANT = {
  INSERT: 'bg-signal-success/15 text-signal-success border border-signal-success/25',
  UPDATE: 'bg-accent/15 text-accent border border-accent/25',
  DELETE: 'bg-signal-danger/15 text-signal-danger border border-signal-danger/25',
}

const fieldCls = `
  h-8 px-3 text-xs bg-navy-700 border border-navy-500 text-navy-100
  placeholder:text-navy-400 focus:outline-none focus:border-accent rounded-md
`

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function DiffView({ before, after }) {
  if (!before && !after) return <p className="text-2xs text-navy-400 italic">No data snapshot.</p>

  if (!before) {
    return (
      <div className="space-y-0.5">
        {Object.entries(after).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-2xs">
            <span className="text-navy-400 w-32 shrink-0 truncate">{k}</span>
            <span className="text-signal-success truncate">{JSON.stringify(v)}</span>
          </div>
        ))}
      </div>
    )
  }

  if (!after) {
    return (
      <div className="space-y-0.5">
        {Object.entries(before).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-2xs">
            <span className="text-navy-400 w-32 shrink-0 truncate">{k}</span>
            <span className="text-signal-danger line-through truncate">{JSON.stringify(v)}</span>
          </div>
        ))}
      </div>
    )
  }

  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  const changed = keys.filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]))

  if (changed.length === 0) return <p className="text-2xs text-navy-400 italic">No field changes detected.</p>

  return (
    <div className="space-y-1.5">
      {changed.map(k => (
        <div key={k} className="text-2xs">
          <span className="text-navy-300 font-medium">{k}</span>
          <div className="mt-0.5 flex flex-col gap-0.5 pl-2">
            <span className="text-signal-danger line-through truncate">{JSON.stringify(before[k])}</span>
            <span className="text-signal-success truncate">{JSON.stringify(after[k])}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AuditLogs() {
  const [logs, setLogs]         = useState([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [page, setPage]         = useState(1)

  const [filters, setFilters] = useState({
    table: '', operation: '', from: '', to: '',
  })

  const load = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const params = { page: pg, limit: 50 }
      if (filters.table)     params.table     = filters.table
      if (filters.operation) params.operation = filters.operation
      if (filters.from)      params.from      = filters.from
      if (filters.to)        params.to        = new Date(filters.to + 'T23:59:59').toISOString()
      const res = await getAuditLogs(params)
      setLogs(res?.data || [])
      setTotal(res?.total || 0)
      setPage(pg)
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load(1) }, [load])

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-navy-500 bg-navy-800">
        <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">Audit Logs</h1>
        <span className="text-2xs text-navy-400">{total.toLocaleString()} entries</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 px-6 py-3 border-b border-navy-500/50 bg-navy-800">
        <div className="flex flex-col gap-1">
          <label className="label-caps">Table</label>
          <select
            className={`${fieldCls} w-36`}
            value={filters.table}
            onChange={e => setFilters(f => ({ ...f, table: e.target.value }))}
          >
            <option value="">All tables</option>
            {Object.entries(TABLE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="label-caps">Operation</label>
          <select
            className={`${fieldCls} w-32`}
            value={filters.operation}
            onChange={e => setFilters(f => ({ ...f, operation: e.target.value }))}
          >
            <option value="">All</option>
            <option value="INSERT">Insert</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="label-caps">From</label>
          <input type="date" className={`${fieldCls} w-36`}
            value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="label-caps">To</label>
          <input type="date" className={`${fieldCls} w-36`}
            value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        </div>
        <Button variant="ghost" size="sm"
          onClick={() => setFilters({ table: '', operation: '', from: '', to: '' })}>
          Clear
        </Button>

        {totalPages > 1 && (
          <div className="ml-auto flex items-center gap-2">
            <Button size="xs" variant="ghost" disabled={page <= 1} onClick={() => load(page - 1)}>← Prev</Button>
            <span className="text-2xs text-navy-400">{page} / {totalPages}</span>
            <Button size="xs" variant="ghost" disabled={page >= totalPages} onClick={() => load(page + 1)}>Next →</Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
        ) : (
          <div className="table-shell">
            <table className="table-base">
              <thead className="sticky top-0 z-10">
                <tr className="table-head-row">
                  <th className="table-th">When</th>
                  <th className="table-th">Who</th>
                  <th className="table-th">Table</th>
                  <th className="table-th">Operation</th>
                  <th className="table-th">Record ID</th>
                  <th className="table-th">Notes</th>
                  <th className="table-th">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-empty">No audit log entries found.</td>
                  </tr>
                ) : logs.map((log, i) => (
                  <>
                    <tr
                      key={log.id}
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                      className={`table-row cursor-pointer ${i % 2 !== 0 ? 'table-row-alt' : ''} ${expanded === log.id ? 'bg-navy-600/30' : ''}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-navy-300 whitespace-nowrap">{formatDate(log.changed_at)}</td>
                      <td className="px-4 py-2.5">
                        {log.changed_by_name
                          ? <><p className="text-navy-100 font-medium">{log.changed_by_name}</p><p className="text-navy-400 text-2xs">{log.changed_by_email}</p></>
                          : <span className="text-navy-500">System</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-navy-200">{TABLE_LABELS[log.table_name] || log.table_name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-2xs font-semibold px-2 py-0.5 rounded ${OP_VARIANT[log.operation] || ''}`}>
                          {log.operation}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-2xs text-navy-400 max-w-[120px] truncate">{log.record_id}</td>
                      <td className="px-4 py-2.5 text-2xs text-navy-400">{log.notes || '—'}</td>
                      <td className="px-4 py-2.5 text-2xs text-accent">
                        {(log.before_data || log.after_data) ? (expanded === log.id ? '▲ Hide' : '▼ Show') : '—'}
                      </td>
                    </tr>
                    {expanded === log.id && (log.before_data || log.after_data) && (
                      <tr key={`${log.id}-detail`} className="bg-navy-800/60">
                        <td colSpan={7} className="px-6 py-4 border-t border-navy-500/40">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {log.operation !== 'INSERT' && (
                              <div>
                                <p className="label-caps mb-2 text-signal-danger">Before</p>
                                <div className="bg-navy-900/50 rounded border border-navy-600 p-3 max-h-48 overflow-y-auto">
                                  <DiffView before={log.before_data} after={null} />
                                </div>
                              </div>
                            )}
                            {log.operation !== 'DELETE' && (
                              <div>
                                <p className="label-caps mb-2 text-signal-success">After</p>
                                <div className="bg-navy-900/50 rounded border border-navy-600 p-3 max-h-48 overflow-y-auto">
                                  <DiffView before={null} after={log.after_data} />
                                </div>
                              </div>
                            )}
                            {log.operation === 'UPDATE' && log.before_data && log.after_data && (
                              <div className="md:col-span-2">
                                <p className="label-caps mb-2">Changed Fields</p>
                                <div className="bg-navy-900/50 rounded border border-navy-600 p-3 max-h-48 overflow-y-auto">
                                  <DiffView before={log.before_data} after={log.after_data} />
                                </div>
                              </div>
                            )}
                          </div>
                          {log.ip_address && (
                            <p className="mt-3 text-2xs text-navy-500">IP: {log.ip_address}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
