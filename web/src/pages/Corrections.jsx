/**
 * Corrections Page — attendance correction requests with approve/reject workflow.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  getCorrections, createCorrection, approveCorrection, rejectCorrection,
  getEmployees, getMyCorrections, createMyCorrection,
  getAttendance, getMyAttendance,
} from '../config/api'
import { useAuth } from '../contexts/AuthContext'
import { fmtDate } from '../lib/format'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import { Input, Select, Textarea } from '../components/ui/Input'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'

const STATUS_VARIANT = { pending: 'warning', approved: 'success', rejected: 'danger' }

const PUNCH_TYPE_VARIANT = { IN: 'success', OUT: 'danger', BREAK_IN: 'info', BREAK_OUT: 'neutral' }

const REASON_LABELS = {
  forgot_to_log: 'Forgot to Log',
  device_down:   'Device Down',
  field_work:    'Field Work',
  system_error:  'System Error',
  other:         'Other',
}

const ADJUSTMENT_OPERATION_LABELS = {
  create: 'Create log',
  update: 'Update log',
  delete: 'Delete log',
}

const ADJUSTMENT_OPERATION_OPTIONS = [
  { value: 'none',   label: 'No direct adjustment (review only)' },
  { value: 'create', label: 'Create attendance log' },
  { value: 'update', label: 'Update existing attendance log' },
  { value: 'delete', label: 'Delete existing attendance log' },
]

const ADJUSTMENT_TYPES = ['IN', 'OUT', 'BREAK_IN', 'BREAK_OUT']

function getPersonLabel(person, fallback = '—') {
  if (!person) return fallback
  if (typeof person === 'object') {
    if (person.email) return person.email
    const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ')
    return fullName || fallback
  }
  return String(person)
}

function toTimeHHmm(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatLogOption(log) {
  return `${toTimeHHmm(log.timestamp)} • ${log.type}${log.source ? ` • ${log.source}` : ''}`
}

// ── Sort helpers ──────────────────────────────────────────────────────
function SortIcon({ dir }) {
  if (!dir) return <span className="ml-1 text-navy-500">↕</span>
  return <span className="ml-1 text-accent">{dir === 'asc' ? '↑' : '↓'}</span>
}

function useSortable(initial = 'targetDate', initialDir = 'desc') {
  const [col, setCol] = useState(initial)
  const [dir, setDir] = useState(initialDir)
  const toggle = (c) => {
    if (col === c) setDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setCol(c); setDir('asc') }
  }
  return { col, dir, toggle }
}

// ── Review Modal ─────────────────────────────────────────────────────
function ReviewModal({ correction, onClose, onDone }) {
  const [action, setAction] = useState('approve')
  const [notes,  setNotes]  = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const empName = typeof correction.employeeId === 'object'
    ? `${correction.employeeId.firstName} ${correction.employeeId.lastName}`
    : correction.employeeId || '—'

  const after = correction.after || {}

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      action === 'approve'
        ? await approveCorrection(correction._id, notes)
        : await rejectCorrection(correction._id, notes)
      onDone()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal
      title="Review Correction"
      subtitle={`Employee: ${empName}`}
      width="max-w-md"
      onClose={onClose}
      onConfirm={submit}
      confirmLabel={action === 'approve' ? 'Approve' : 'Reject'}
      confirmVariant={action === 'approve' ? 'primary' : 'danger'}
      loading={saving}
    >
      <div className="space-y-4">
        {error && (
          <p className="text-2xs text-signal-danger px-3 py-2 bg-signal-danger/8
                        border border-signal-danger/25 rounded-md">{error}</p>
        )}

        <div className="bg-navy-600 border border-navy-500 rounded-md px-4 py-3 text-xs space-y-1.5">
          <div className="flex gap-3">
            <span className="label-caps w-24">Date</span>
            <span className="text-navy-100 font-mono tabular">{fmtDate(correction.targetDate)}</span>
          </div>
          <div className="flex gap-3">
            <span className="label-caps w-24">Operation</span>
            <span className="text-navy-100">{ADJUSTMENT_OPERATION_LABELS[after.operation] || '—'}</span>
          </div>
          {after.type && (
            <div className="flex gap-3">
              <span className="label-caps w-24">Punch Type</span>
              <Badge variant={PUNCH_TYPE_VARIANT[after.type] ?? 'neutral'}>{after.type}</Badge>
            </div>
          )}
          {after.time && (
            <div className="flex gap-3">
              <span className="label-caps w-24">Time</span>
              <span className="text-navy-100 font-mono tabular">{after.time}</span>
            </div>
          )}
          <div className="flex gap-3">
            <span className="label-caps w-24">Reason</span>
            <span className="text-navy-100">{correction.notes || REASON_LABELS[correction.reasonCode] || '—'}</span>
          </div>
        </div>

        <div>
          <p className="label-caps mb-2">Decision</p>
          <div className="flex gap-4">
            {['approve', 'reject'].map(a => (
              <label key={a} className="flex items-center gap-2 cursor-pointer text-xs">
                <input type="radio" name="action" value={a}
                  checked={action === a} onChange={() => setAction(a)}
                  className="accent-accent" />
                <span className={a === 'approve' ? 'text-signal-success font-semibold' : 'text-signal-danger font-semibold'}>
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <Textarea label="Review Notes" rows={3} value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Optional notes visible to the requester…" />
      </div>
    </Modal>
  )
}

// ── New Correction Modal ──────────────────────────────────────────────
export function NewCorrectionModal({
  employees,
  canSelectEmployee,
  selfServiceOnly,
  defaultEmployeeId,
  initialValues,
  onClose,
  onDone,
  onSubmit,
}) {
  const [form, setForm] = useState({
    employeeId: initialValues?.employeeId || defaultEmployeeId || '',
    targetDate: initialValues?.targetDate || '',
    reason: '',
    notes: '',
    adjustmentOperation: initialValues?.adjustmentOperation || 'none',
    adjustmentType: initialValues?.adjustmentType || 'IN',
    adjustmentTime: initialValues?.adjustmentTime || '',
    adjustmentLogId: initialValues?.adjustmentLogId || '',
  })
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [empSearch,   setEmpSearch]   = useState(() => {
    if (initialValues?.employeeId && employees?.length) {
      const emp = employees.find(e => e._id === initialValues.employeeId)
      return emp ? `${emp.firstName} ${emp.lastName}` : ''
    }
    return ''
  })
  const [empOpen,     setEmpOpen]     = useState(false)
  const [dateLogs,    setDateLogs]    = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError,   setLogsError]   = useState('')

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      employeeId: canSelectEmployee ? prev.employeeId : (defaultEmployeeId || ''),
    }))
  }, [canSelectEmployee, defaultEmployeeId])

  useEffect(() => {
    const needsExistingLog = form.adjustmentOperation === 'update' || form.adjustmentOperation === 'delete'
    if (!needsExistingLog) { setDateLogs([]); setLogsError(''); return }
    if (!form.targetDate) { setDateLogs([]); setLogsError('Select a date first to load attendance logs.'); return }
    if (canSelectEmployee && !form.employeeId) { setDateLogs([]); setLogsError('Select an employee first to load attendance logs.'); return }

    let active = true
    setLogsLoading(true)
    setLogsError('')

    const loadLogs = async () => {
      try {
        const params = { start_date: form.targetDate, end_date: form.targetDate, limit: 200 }
        const response = selfServiceOnly
          ? await getMyAttendance(params)
          : await getAttendance({ ...params, employeeId: form.employeeId })
        if (!active) return
        const logs = Array.isArray(response?.data) ? response.data : []
        const sorted = [...logs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        setDateLogs(sorted)
        if (!sorted.some(l => l._id === form.adjustmentLogId)) setForm(p => ({ ...p, adjustmentLogId: '' }))
        if (!sorted.length) setLogsError('No attendance logs found for that date.')
      } catch (err) {
        if (!active) return
        setDateLogs([])
        setLogsError(err.message || 'Unable to load attendance logs for selected date.')
      } finally { if (active) setLogsLoading(false) }
    }

    loadLogs()
    return () => { active = false }
  }, [canSelectEmployee, form.adjustmentLogId, form.adjustmentOperation, form.employeeId, form.targetDate, selfServiceOnly])

  useEffect(() => {
    if (!form.adjustmentLogId) return
    const selected = dateLogs.find(l => l._id === form.adjustmentLogId)
    if (!selected || form.adjustmentOperation !== 'update') return
    setForm(prev => ({
      ...prev,
      adjustmentType: prev.adjustmentType || selected.type,
      adjustmentTime: prev.adjustmentTime || toTimeHHmm(selected.timestamp),
    }))
  }, [dateLogs, form.adjustmentLogId, form.adjustmentOperation])

  const submit = async () => {
    if (!form.targetDate)                                                                      { setError('Date is required'); return }
    if (canSelectEmployee && !form.employeeId)                                                 { setError('Employee is required'); return }
    if (form.adjustmentOperation === 'create' && !form.adjustmentType)                        { setError('Punch type is required'); return }
    if (form.adjustmentOperation === 'create' && !form.adjustmentTime)                        { setError('Time is required'); return }
    if ((form.adjustmentOperation === 'update' || form.adjustmentOperation === 'delete') && !form.adjustmentLogId) { setError('Select an existing attendance log'); return }
    if (!form.reason.trim())                                                                   { setError('Reason is required'); return }

    const payload = { targetDate: form.targetDate, reason: form.reason, notes: form.notes }
    if (canSelectEmployee) payload.employeeId = form.employeeId
    if (form.adjustmentOperation !== 'none') {
      payload.after = {
        operation: form.adjustmentOperation,
        type: form.adjustmentType,
        time: form.adjustmentTime,
        logId: form.adjustmentLogId,
      }
    }

    setSaving(true)
    setError('')
    try { await onSubmit(payload); onDone() }
    catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal
      title={initialValues ? "Request Log Correction" : "New Correction Request"}
      width="max-w-md"
      onClose={onClose}
      onConfirm={submit}
      confirmLabel="Submit"
      loading={saving}
    >
      <div className="space-y-3">
        {error && (
          <p className="text-2xs text-signal-danger px-3 py-2 bg-signal-danger/8
                        border border-signal-danger/25 rounded-md">{error}</p>
        )}
        {canSelectEmployee ? (
          <div className="relative">
            <label className="label-caps mb-1 block">Employee *</label>
            <input
              className="w-full h-9 px-3 text-sm bg-navy-600 border border-navy-500 text-navy-100 placeholder:text-navy-300/40 focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/30 transition-colors duration-80 rounded-md focus:outline-none"
              placeholder="Search employee…"
              value={empSearch}
              onChange={e => { setEmpSearch(e.target.value); setEmpOpen(true); setForm(p => ({ ...p, employeeId: '' })) }}
              onFocus={() => setEmpOpen(true)}
              onBlur={() => setTimeout(() => setEmpOpen(false), 150)}
            />
            {empOpen && (
              <ul className="absolute z-50 w-full mt-1 bg-navy-700 border border-navy-500 rounded-md shadow-lg max-h-48 overflow-y-auto">
                {employees
                  .filter(e => `${e.firstName} ${e.lastName}`.toLowerCase().includes(empSearch.toLowerCase()))
                  .map(e => (
                    <li key={e._id}
                      className="px-3 py-2 text-sm text-navy-100 hover:bg-navy-600 cursor-pointer"
                      onMouseDown={() => { setForm(p => ({ ...p, employeeId: e._id })); setEmpSearch(`${e.firstName} ${e.lastName}`); setEmpOpen(false) }}>
                      {e.firstName} {e.lastName}
                    </li>
                  ))}
                {employees.filter(e => `${e.firstName} ${e.lastName}`.toLowerCase().includes(empSearch.toLowerCase())).length === 0 && (
                  <li className="px-3 py-2 text-sm text-navy-400">No employees found</li>
                )}
              </ul>
            )}
          </div>
        ) : (
          <Input label="Employee" value="Current logged-in employee" disabled />
        )}
        <Input type="date" label="Date *" value={form.targetDate}
          onChange={e => setForm(p => ({ ...p, targetDate: e.target.value }))} />
        <Textarea label="Reason *" rows={2} placeholder="Describe why this correction is needed…" value={form.reason}
          onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
        <Textarea label="Additional Notes" rows={2} value={form.notes}
          onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />

        <div className="border border-navy-500 rounded-md p-3 space-y-3 bg-navy-600/50">
          <p className="label-caps">Requested Attendance Adjustment</p>
          <Select label="Operation" value={form.adjustmentOperation}
            onChange={e => setForm(p => ({ ...p, adjustmentOperation: e.target.value }))}>
            {ADJUSTMENT_OPERATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>

          {form.adjustmentOperation !== 'none' && (
            <>
              {(form.adjustmentOperation === 'create' || form.adjustmentOperation === 'update') && (
                <Select label="Punch Type" value={form.adjustmentType}
                  onChange={e => setForm(p => ({ ...p, adjustmentType: e.target.value }))}>
                  {ADJUSTMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </Select>
              )}
              {(form.adjustmentOperation === 'create' || form.adjustmentOperation === 'update') && (
                <Input type="time" label="Time (HH:mm)" value={form.adjustmentTime}
                  onChange={e => setForm(p => ({ ...p, adjustmentTime: e.target.value }))} />
              )}
              {(form.adjustmentOperation === 'update' || form.adjustmentOperation === 'delete') && (
                <div className="space-y-2">
                  <Select label="Existing Attendance Log" value={form.adjustmentLogId}
                    onChange={e => setForm(p => ({ ...p, adjustmentLogId: e.target.value }))}
                    disabled={logsLoading || dateLogs.length === 0}>
                    <option value="">Select a log...</option>
                    {dateLogs.map(log => <option key={log._id} value={log._id}>{formatLogOption(log)}</option>)}
                  </Select>
                  {logsLoading && <p className="text-2xs text-navy-300">Loading attendance logs...</p>}
                  {!!logsError && <p className="text-2xs text-signal-warning">{logsError}</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── Page ─────────────────────────────────────────────────────────────
export default function Corrections() {
  const { user } = useAuth()
  const canReview     = ['super_admin', 'client_admin', 'hr_payroll', 'branch_manager'].includes(user?.role)
  const selfServiceOnly = user?.role === 'employee'

  const [corrections,    setCorrections]    = useState([])
  const [employees,      setEmployees]      = useState([])
  const [loading,        setLoading]        = useState(true)
  const [statusFilter,   setStatusFilter]   = useState('pending')
  const [search,         setSearch]         = useState('')
  const [selected,       setSelected]       = useState(null)
  const [showNew,        setShowNew]        = useState(false)
  const [reviewAction,   setReviewAction]   = useState('approve')
  const [reviewNotes,    setReviewNotes]    = useState('')
  const [reviewSaving,   setReviewSaving]   = useState(false)
  const [reviewError,    setReviewError]    = useState('')
  const { col, dir, toggle } = useSortable('targetDate', 'desc')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (selfServiceOnly) {
        const cRes = await getMyCorrections(statusFilter ? { status: statusFilter } : {})
        setCorrections(cRes?.data || [])
        setEmployees([])
      } else {
        const [cRes, eRes] = await Promise.all([
          getCorrections(statusFilter ? { status: statusFilter } : {}),
          getEmployees(),
        ])
        setCorrections(cRes?.data || [])
        setEmployees(eRes?.data  || [])
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [selfServiceOnly, statusFilter])

  useEffect(() => { load() }, [load])

  // Keep selected in sync after reload
  useEffect(() => {
    if (!selected) return
    const next = corrections.find(c => c._id === selected._id)
    if (next) setSelected(next)
  }, [corrections, selected?._id])

  const selectRow = (c) => {
    setSelected(prev => prev?._id === c._id ? null : c)
    setReviewAction('approve')
    setReviewNotes('')
    setReviewError('')
  }

  const handleReview = async () => {
    if (!selected) return
    setReviewSaving(true)
    setReviewError('')
    try {
      reviewAction === 'approve'
        ? await approveCorrection(selected._id, reviewNotes)
        : await rejectCorrection(selected._id, reviewNotes)
      setSelected(null)
      load()
    } catch (err) {
      setReviewError(err.message)
    } finally {
      setReviewSaving(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const list = q
      ? corrections.filter(c => {
          const empName = getPersonLabel(c.employeeId, '').toLowerCase()
          const reason  = (c.notes || REASON_LABELS[c.reasonCode] || '').toLowerCase()
          const type    = (c.after?.type || '').toLowerCase()
          const op      = (c.after?.operation || '').toLowerCase()
          return empName.includes(q) || reason.includes(q) || type.includes(q) || op.includes(q)
        })
      : corrections

    return [...list].sort((a, b) => {
      let aVal, bVal
      if (col === 'targetDate') {
        aVal = new Date(a.targetDate).getTime()
        bVal = new Date(b.targetDate).getTime()
      } else if (col === 'employee') {
        aVal = getPersonLabel(a.employeeId, '').toLowerCase()
        bVal = getPersonLabel(b.employeeId, '').toLowerCase()
      } else if (col === 'type') {
        aVal = a.after?.type || ''
        bVal = b.after?.type || ''
      } else if (col === 'status') {
        aVal = a.status || ''
        bVal = b.status || ''
      } else {
        return 0
      }
      if (aVal < bVal) return dir === 'asc' ? -1 : 1
      if (aVal > bVal) return dir === 'asc' ? 1 : -1
      return 0
    })
  }, [corrections, search, col, dir])

  const STATUS_TABS = ['pending', 'approved', 'rejected', '']
  const thClass = 'table-th cursor-pointer select-none hover:text-navy-100 transition-colors'

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-navy-500 bg-navy-800">
        <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">
          Attendance Corrections
        </h1>
        <Button variant="primary" size="md" onClick={() => setShowNew(true)}>+ New Request</Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-2.5 border-b border-navy-500/50 bg-navy-800">
        <div className="flex items-center gap-1">
          {STATUS_TABS.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-4 h-7 text-xs font-medium uppercase tracking-wider transition-colors duration-80 rounded-md
                         ${statusFilter === s ? 'bg-accent text-white' : 'text-navy-300 hover:text-navy-100 hover:bg-navy-700'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>
        <div className="ml-auto w-56">
          <input
            className="w-full h-8 px-3 text-xs bg-navy-700 border border-navy-500 text-navy-100 placeholder:text-navy-400 rounded-md focus:outline-none focus:border-accent"
            placeholder="Search employee, reason, type…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
        ) : (
          <>
            <div className="table-shell">
              <table className="table-base">
                <thead className="sticky top-0 z-10">
                  <tr className="table-head-row">
                    <th className={thClass} onClick={() => toggle('employee')}>
                      Employee <SortIcon dir={col === 'employee' ? dir : null} />
                    </th>
                    <th className={thClass} onClick={() => toggle('targetDate')}>
                      Date <SortIcon dir={col === 'targetDate' ? dir : null} />
                    </th>
                    <th className="table-th">Operation</th>
                    <th className={thClass} onClick={() => toggle('type')}>
                      Punch Type <SortIcon dir={col === 'type' ? dir : null} />
                    </th>
                    <th className={thClass} onClick={() => toggle('status')}>
                      Status <SortIcon dir={col === 'status' ? dir : null} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="table-empty">
                        {search ? 'No corrections match your search.' : 'No corrections found.'}
                      </td>
                    </tr>
                  ) : filtered.map((c, i) => {
                    const after = c.after || {}
                    return (
                      <tr
                        key={c._id}
                        onClick={() => selectRow(c)}
                        className={`table-row cursor-pointer ${i % 2 !== 0 ? 'table-row-alt' : ''} ${selected?._id === c._id ? 'bg-accent/10' : ''}`}
                      >
                        <td className="px-4 py-2.5 font-medium text-navy-100">{getPersonLabel(c.employeeId)}</td>
                        <td className="px-4 py-2.5 font-mono tabular text-navy-300 whitespace-nowrap">{fmtDate(c.targetDate)}</td>
                        <td className="px-4 py-2.5 text-navy-300 text-xs">
                          {after.operation ? (ADJUSTMENT_OPERATION_LABELS[after.operation] || after.operation) : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          {after.type
                            ? <Badge variant={PUNCH_TYPE_VARIANT[after.type] ?? 'neutral'}>{after.type}</Badge>
                            : <span className="text-navy-500">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={STATUS_VARIANT[c.status] ?? 'neutral'}>{c.status}</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Detail panel */}
            {selected && (() => {
              const after = selected.after || {}
              const isPending = selected.status === 'pending'
              return (
                <div className="mt-5 table-shell p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="label-caps">Correction Request</p>
                      <p className="mt-1 text-sm font-semibold text-navy-100">{getPersonLabel(selected.employeeId)}</p>
                      <p className="text-2xs text-navy-300 mt-0.5">{fmtDate(selected.targetDate)}</p>
                      <div className="mt-2">
                        <Badge variant={STATUS_VARIANT[selected.status] ?? 'neutral'}>{selected.status}</Badge>
                      </div>
                    </div>
                    <button onClick={() => setSelected(null)} className="text-navy-400 hover:text-navy-100 text-xl leading-none">×</button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    <div className="rounded-md border border-navy-500 bg-navy-700/40 px-4 py-3">
                      <p className="label-caps">Adjustment</p>
                      <p className="mt-2 text-xs text-navy-100">Operation: {ADJUSTMENT_OPERATION_LABELS[after.operation] || '—'}</p>
                      <p className="mt-1 text-xs text-navy-300">Punch Type: {after.type || '—'}</p>
                      <p className="mt-1 text-xs text-navy-300">Time: {after.time || '—'}</p>
                    </div>

                    <div className="rounded-md border border-navy-500 bg-navy-700/40 px-4 py-3">
                      <p className="label-caps">Reason</p>
                      <p className="mt-2 text-xs text-navy-100 leading-relaxed">{selected.notes || REASON_LABELS[selected.reasonCode] || '—'}</p>
                    </div>

                    <div className="rounded-md border border-navy-500 bg-navy-700/40 px-4 py-3">
                      <p className="label-caps">People</p>
                      <p className="mt-2 text-xs text-navy-100">Requested by: {getPersonLabel(selected.requestedBy)}</p>
                      <p className="mt-1 text-xs text-navy-300">Reviewed by: {selected.reviewedBy ? getPersonLabel(selected.reviewedBy) : '—'}</p>
                      {selected.reviewNotes && (
                        <p className="mt-1 text-xs text-navy-400 italic">"{selected.reviewNotes}"</p>
                      )}
                    </div>
                  </div>

                  {isPending && canReview && (
                    <div className="mt-4 rounded-md border border-navy-500 bg-navy-700/40 px-4 py-4 space-y-3">
                      <p className="label-caps">Decision</p>
                      {reviewError && (
                        <p className="text-2xs text-signal-danger px-3 py-2 bg-signal-danger/8 border border-signal-danger/25 rounded-md">{reviewError}</p>
                      )}
                      <div className="flex gap-4">
                        {['approve', 'reject'].map(a => (
                          <label key={a} className="flex items-center gap-2 cursor-pointer text-xs">
                            <input type="radio" name="reviewAction" value={a}
                              checked={reviewAction === a} onChange={() => setReviewAction(a)}
                              className="accent-accent" />
                            <span className={a === 'approve' ? 'text-signal-success font-semibold' : 'text-signal-danger font-semibold'}>
                              {a.charAt(0).toUpperCase() + a.slice(1)}
                            </span>
                          </label>
                        ))}
                      </div>
                      <textarea
                        rows={2}
                        placeholder="Review notes (optional)…"
                        value={reviewNotes}
                        onChange={e => setReviewNotes(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-navy-600 border border-navy-500 text-navy-100 placeholder:text-navy-400 rounded-md focus:outline-none focus:border-accent resize-none"
                      />
                      <Button
                        variant={reviewAction === 'approve' ? 'primary' : 'danger'}
                        size="sm"
                        loading={reviewSaving}
                        onClick={handleReview}
                      >
                        {reviewAction === 'approve' ? 'Approve Request' : 'Reject Request'}
                      </Button>
                    </div>
                  )}
                </div>
              )
            })()}
          </>
        )}
      </div>

      {showNew && (
        <NewCorrectionModal
          employees={employees}
          canSelectEmployee={!selfServiceOnly}
          selfServiceOnly={selfServiceOnly}
          defaultEmployeeId={user?.employeeId || ''}
          onSubmit={(payload) => selfServiceOnly ? createMyCorrection(payload) : createCorrection(payload)}
          onClose={() => setShowNew(false)}
          onDone={() => { setShowNew(false); load() }}
        />
      )}
    </div>
  )
}
