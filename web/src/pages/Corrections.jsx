/**
 * Corrections Page — attendance correction requests with approve/reject workflow.
 */

import { useState, useEffect, useCallback } from 'react'
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
  { value: 'none', label: 'No direct adjustment (review only)' },
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

function formatAdjustment(adjustment) {
  if (!adjustment?.operation) return 'No direct attendance change requested'
  const op = ADJUSTMENT_OPERATION_LABELS[adjustment.operation] || adjustment.operation
  const pieces = [op]
  if (adjustment.type) pieces.push(adjustment.type)
  if (adjustment.time) pieces.push(`at ${adjustment.time}`)
  if (adjustment.logId) pieces.push(`log: ${String(adjustment.logId).slice(0, 8)}...`)
  return pieces.join(' • ')
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

// ── Review Modal ─────────────────────────────────────────────────────
function ReviewModal({ correction, onClose, onDone }) {
  const [action,  setAction]  = useState('approve')
  const [notes,   setNotes]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const empName = typeof correction.employeeId === 'object'
    ? `${correction.employeeId.firstName} ${correction.employeeId.lastName}`
    : correction.employeeId || '—'

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

        {/* Correction summary */}
        <div className="bg-navy-600 border border-navy-500 rounded-md px-4 py-3 text-xs space-y-1.5">
          <div className="flex gap-3">
            <span className="label-caps w-20">Date</span>
            <span className="text-navy-100 font-mono tabular">{fmtDate(correction.targetDate)}</span>
          </div>
          <div className="flex gap-3">
            <span className="label-caps w-20">Reason</span>
            <span className="text-navy-100">{correction.notes || REASON_LABELS[correction.reasonCode] || '—'}</span>
          </div>
          {correction.notes && (
            <div className="flex gap-3">
              <span className="label-caps w-20">Notes</span>
              <span className="text-navy-300">{correction.notes}</span>
            </div>
          )}
          <div className="flex gap-3">
            <span className="label-caps w-20">Adjustment</span>
            <span className="text-navy-300">{formatAdjustment(correction.after)}</span>
          </div>
        </div>

        {/* Radio decision */}
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
function NewCorrectionModal({
  employees,
  canSelectEmployee,
  selfServiceOnly,
  defaultEmployeeId,
  onClose,
  onDone,
  onSubmit,
}) {
  const [form, setForm]   = useState({
    employeeId: defaultEmployeeId || '',
    targetDate: '',
    reason: '',
    notes: '',
    adjustmentOperation: 'none',
    adjustmentType: 'IN',
    adjustmentTime: '',
    adjustmentLogId: '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [empSearch, setEmpSearch] = useState('')
  const [empOpen, setEmpOpen] = useState(false)
  const [dateLogs, setDateLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState('')

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      employeeId: canSelectEmployee ? prev.employeeId : (defaultEmployeeId || ''),
    }))
  }, [canSelectEmployee, defaultEmployeeId])

  useEffect(() => {
    const needsExistingLog = form.adjustmentOperation === 'update' || form.adjustmentOperation === 'delete'
    if (!needsExistingLog) {
      setDateLogs([])
      setLogsError('')
      return
    }

    if (!form.targetDate) {
      setDateLogs([])
      setLogsError('Select a date first to load attendance logs.')
      return
    }

    if (canSelectEmployee && !form.employeeId) {
      setDateLogs([])
      setLogsError('Select an employee first to load attendance logs.')
      return
    }

    let active = true
    setLogsLoading(true)
    setLogsError('')

    const loadLogs = async () => {
      try {
        const params = {
          start_date: form.targetDate,
          end_date: form.targetDate,
          limit: 200,
        }
        const response = selfServiceOnly
          ? await getMyAttendance(params)
          : await getAttendance({ ...params, employeeId: form.employeeId })

        if (!active) return
        const logs = Array.isArray(response?.data) ? response.data : []
        const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        setDateLogs(sorted)

        const hasSelected = sorted.some((log) => log._id === form.adjustmentLogId)
        if (!hasSelected) {
          setForm((prev) => ({ ...prev, adjustmentLogId: '' }))
        }

        if (!sorted.length) {
          setLogsError('No attendance logs found for that date.')
        }
      } catch (err) {
        if (!active) return
        setDateLogs([])
        setLogsError(err.message || 'Unable to load attendance logs for selected date.')
      } finally {
        if (active) setLogsLoading(false)
      }
    }

    loadLogs()
    return () => { active = false }
  }, [
    canSelectEmployee,
    form.adjustmentLogId,
    form.adjustmentOperation,
    form.employeeId,
    form.targetDate,
    selfServiceOnly,
  ])

  useEffect(() => {
    if (!form.adjustmentLogId) return
    const selected = dateLogs.find((log) => log._id === form.adjustmentLogId)
    if (!selected) return

    if (form.adjustmentOperation === 'update') {
      setForm((prev) => ({
        ...prev,
        adjustmentType: prev.adjustmentType || selected.type,
        adjustmentTime: prev.adjustmentTime || toTimeHHmm(selected.timestamp),
      }))
    }
  }, [dateLogs, form.adjustmentLogId, form.adjustmentOperation])

  const submit = async () => {
    if (!form.targetDate) {
      setError('Date is required')
      return
    }
    if (canSelectEmployee && !form.employeeId) {
      setError('Employee is required')
      return
    }

    if (form.adjustmentOperation === 'create') {
      if (!form.adjustmentType) {
        setError('Adjustment punch type is required')
        return
      }
      if (!form.adjustmentTime) {
        setError('Adjustment time is required for create operation')
        return
      }
    }

    if ((form.adjustmentOperation === 'update' || form.adjustmentOperation === 'delete') && !form.adjustmentLogId) {
      setError('Select an existing attendance log for update/delete operations')
      return
    }

    if (!form.reason.trim()) {
      setError('Reason is required')
      return
    }

    const payload = {
      targetDate: form.targetDate,
      reason: form.reason,
      notes: form.notes,
    }

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
    try {
      await onSubmit(payload)
      onDone()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal
      title="New Correction Request"
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
              className="input w-full"
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
                    <li
                      key={e._id}
                      className="px-3 py-2 text-sm text-navy-100 hover:bg-navy-600 cursor-pointer"
                      onMouseDown={() => {
                        setForm(p => ({ ...p, employeeId: e._id }))
                        setEmpSearch(`${e.firstName} ${e.lastName}`)
                        setEmpOpen(false)
                      }}
                    >
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
            {ADJUSTMENT_OPERATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>

          {form.adjustmentOperation !== 'none' && (
            <>
              {(form.adjustmentOperation === 'create' || form.adjustmentOperation === 'update') && (
                <Select label="Punch Type" value={form.adjustmentType}
                  onChange={e => setForm(p => ({ ...p, adjustmentType: e.target.value }))}>
                  {ADJUSTMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
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
                    {dateLogs.map((log) => (
                      <option key={log._id} value={log._id}>{formatLogOption(log)}</option>
                    ))}
                  </Select>
                  {logsLoading && <p className="text-2xs text-navy-300">Loading attendance logs...</p>}
                  {!!logsError && <p className="text-2xs text-signal-warning">{logsError}</p>}
                  {form.adjustmentLogId && (
                    <p className="text-2xs text-navy-300">Selected log ID: {form.adjustmentLogId}</p>
                  )}
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
  const canReview = ['super_admin', 'client_admin', 'hr_payroll', 'branch_manager'].includes(user?.role)
  const selfServiceOnly = user?.role === 'employee'

  const [corrections,  setCorrections]  = useState([])
  const [employees,    setEmployees]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [reviewTarget, setReviewTarget] = useState(null)
  const [showNew,      setShowNew]      = useState(false)

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
        setEmployees(eRes?.data   || [])
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [selfServiceOnly, statusFilter])

  useEffect(() => { load() }, [load])

  const STATUS_TABS = ['pending', 'approved', 'rejected', '']

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-3.5
                      border-b border-navy-500 bg-navy-800">
        <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">
          Attendance Corrections
        </h1>
        <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>
          + New Request
        </Button>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-1 px-6 py-2.5 border-b border-navy-500/50 bg-navy-800">
        {STATUS_TABS.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 h-7 text-xs font-medium uppercase tracking-wider
                       transition-colors duration-80 rounded-md
                       ${statusFilter === s
                         ? 'bg-accent text-white'
                         : 'text-navy-300 hover:text-navy-100 hover:bg-navy-700'}`}
          >
            {s || 'All'}
          </button>
        ))}
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
                  {['Employee', 'Date', 'Reason', 'Requested By', 'Status', 'Reviewed By', ''].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {corrections.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-empty">
                      No corrections found.
                    </td>
                  </tr>
                ) : corrections.map((c, i) => {
                  const emp    = c.employeeId
                  const empN   = getPersonLabel(emp)
                  const reqBy  = c.requestedBy
                  const reqN   = getPersonLabel(reqBy)
                  const revBy  = c.reviewedBy
                  const revN   = getPersonLabel(revBy)
                  return (
                    <tr key={c._id}
                        className={`table-row ${i % 2 !== 0 ? 'table-row-alt' : ''}`}>
                    <td className="px-4 py-2.5 font-medium text-navy-100">{empN}</td>
                    <td className="px-4 py-2.5 font-mono tabular text-navy-300">{fmtDate(c.targetDate)}</td>
                    <td className="px-4 py-2.5 text-navy-200">{c.notes || REASON_LABELS[c.reasonCode] || '—'}</td>
                    <td className="px-4 py-2.5 text-navy-400">{reqN}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={STATUS_VARIANT[c.status] ?? 'neutral'}>{c.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-navy-400">{revBy ? revN : '—'}</td>
                    <td className="px-4 py-2.5">
                      {c.status === 'pending' && canReview && (
                        <button onClick={() => setReviewTarget(c)}
                          className="text-accent hover:text-accent-200 transition-colors font-medium">
                          Review
                        </button>
                      )}
                    </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reviewTarget && (
        <ReviewModal
          correction={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onDone={() => { setReviewTarget(null); load() }}
        />
      )}

      {showNew && (
        <NewCorrectionModal
          employees={employees}
          canSelectEmployee={!selfServiceOnly}
          selfServiceOnly={selfServiceOnly}
          defaultEmployeeId={user?.employeeId || ''}
          onSubmit={(payload) => (selfServiceOnly ? createMyCorrection(payload) : createCorrection(payload))}
          onClose={() => setShowNew(false)}
          onDone={() => { setShowNew(false); load() }}
        />
      )}
    </div>
  )
}


