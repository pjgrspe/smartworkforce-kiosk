/**
 * Leaves — Sick Leave / Vacation Leave request and approval.
 *
 * - Employees with a linked profile can submit SL/VL requests.
 * - HR / admins see all requests and can approve or reject.
 * - On approval the server auto-creates paid day-off entries so
 *   the payroll engine counts those days as present (full pay, no deductions).
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  getLeaves, getMyLeaves,
  getMyLeaveBalance, getEmployeeLeaveBalance,
  createLeave, createMyLeave,
  approveLeave, rejectLeave,
  getEmployees,
} from '../config/api'

const REVIEWER_ROLES = ['super_admin', 'client_admin', 'hr_payroll', 'branch_manager']

const LEAVE_LABELS = {
  sick_leave:      'Sick Leave',
  vacation_leave:  'Vacation Leave',
}

const STATUS_STYLE = {
  pending:  'bg-signal-warning/10 text-signal-warning  border border-signal-warning/30',
  approved: 'bg-signal-success/10 text-signal-success  border border-signal-success/30',
  rejected: 'bg-signal-danger/10  text-signal-danger   border border-signal-danger/30',
}

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function dayCount(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const ms = new Date(endDate + 'T00:00:00') - new Date(startDate + 'T00:00:00')
  return Math.max(1, Math.round(ms / 86400000) + 1)
}

// ── Review modal ─────────────────────────────────────────────────────────────
function ReviewModal({ leave, action, onConfirm, onCancel }) {
  const [notes, setNotes] = useState('')
  const [busy, setBusy]   = useState(false)

  const submit = async () => {
    setBusy(true)
    try { await onConfirm(leave, action, notes) } finally { setBusy(false) }
  }

  const name = leave?.employeeId?.firstName
    ? `${leave.employeeId.firstName} ${leave.employeeId.lastName}`
    : 'Employee'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-navy-800 rounded-xl border border-navy-500/60 shadow-2xl p-6 mx-4">
        <h3 className={`text-sm font-semibold mb-1 ${action === 'approve' ? 'text-signal-success' : 'text-signal-danger'}`}>
          {action === 'approve' ? 'Approve Leave' : 'Reject Leave'}
        </h3>
        <p className="text-xs text-navy-300 mb-4">
          {name} — {LEAVE_LABELS[leave?.leaveType]} &middot; {fmt(leave?.startDate)} – {fmt(leave?.endDate)}
        </p>
        <label className="label-caps block mb-1">Notes (optional)</label>
        <textarea
          rows={3}
          className="field-base w-full px-3 py-2 text-sm resize-none mb-4"
          placeholder="Add a note for the employee…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-xs text-navy-300 hover:text-navy-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className={`px-5 py-2 text-xs font-semibold rounded-md text-white transition-colors disabled:opacity-50 ${
              action === 'approve'
                ? 'bg-signal-success hover:bg-signal-success/80'
                : 'bg-signal-danger hover:bg-signal-danger/80'
            }`}
          >
            {busy ? 'Saving…' : action === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Leave card ───────────────────────────────────────────────────────────────
function LeaveCard({ leave, isReviewer, onReview }) {
  const empName = leave.employeeId?.firstName
    ? `${leave.employeeId.firstName} ${leave.employeeId.lastName}`
    : null
  const reviewerName = leave.reviewedBy?.firstName
    ? `${leave.reviewedBy.firstName} ${leave.reviewedBy.lastName}`
    : null
  const days = dayCount(leave.startDate, leave.endDate)

  return (
    <div className="bg-navy-700 rounded-lg border border-navy-500/60 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {empName && (
            <p className="text-xs font-semibold text-navy-100 mb-0.5">
              {empName}
              {leave.employeeId?.employeeCode && (
                <span className="ml-1.5 text-navy-400 font-normal">#{leave.employeeId.employeeCode}</span>
              )}
            </p>
          )}
          <p className="text-sm font-semibold text-navy-50">
            {LEAVE_LABELS[leave.leaveType] || leave.leaveType}
          </p>
          <p className="text-xs text-navy-400 mt-0.5">
            {fmt(leave.startDate)} – {fmt(leave.endDate)}
            <span className="ml-1.5 text-navy-500">({days} day{days !== 1 ? 's' : ''})</span>
          </p>
        </div>
        <span className={`shrink-0 text-2xs font-semibold uppercase tracking-wider px-2 py-1 rounded-md ${STATUS_STYLE[leave.status]}`}>
          {leave.status}
        </span>
      </div>

      {leave.notes && (
        <p className="text-xs text-navy-300 border-l-2 border-navy-500/50 pl-3">{leave.notes}</p>
      )}

      {leave.status !== 'pending' && reviewerName && (
        <p className="text-2xs text-navy-500">
          {leave.status === 'approved' ? 'Approved' : 'Rejected'} by {reviewerName}
          {leave.reviewNotes && ` — "${leave.reviewNotes}"`}
        </p>
      )}

      {isReviewer && leave.status === 'pending' && (
        <div className="flex gap-2 pt-1 border-t border-navy-500/40">
          <button
            onClick={() => onReview(leave, 'approve')}
            className="flex-1 py-1.5 text-xs font-medium text-signal-success border border-signal-success/30 rounded-md hover:bg-signal-success/10 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={() => onReview(leave, 'reject')}
            className="flex-1 py-1.5 text-xs font-medium text-signal-danger border border-signal-danger/30 rounded-md hover:bg-signal-danger/10 transition-colors"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

// ── Leave balance bar ─────────────────────────────────────────────────────────
function BalanceBar({ balance }) {
  if (!balance) return null
  if (balance.hasAccess === false) {
    return (
      <p className="text-xs text-navy-400 bg-navy-800 border border-navy-500/40 rounded-md px-3 py-2">
        This employee does not have leave access.
      </p>
    )
  }
  const items = [
    { key: 'sick_leave',     label: 'Sick Leave'     },
    { key: 'vacation_leave', label: 'Vacation Leave' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map(({ key, label }) => {
        const b = balance[key] || { quota: 0, used: 0, remaining: 0, enabled: true }
        if (!b.enabled) {
          return (
            <div key={key} className="bg-navy-800 rounded-md border border-navy-500/50 p-3 opacity-50">
              <span className="text-2xs text-navy-400 uppercase tracking-wider">{label}</span>
              <p className="text-2xs text-navy-500 mt-1">Not enabled</p>
            </div>
          )
        }
        const pct = b.quota > 0 ? Math.min(100, (b.used / b.quota) * 100) : 0
        return (
          <div key={key} className="bg-navy-800 rounded-md border border-navy-500/50 p-3">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-2xs text-navy-400 uppercase tracking-wider">{label}</span>
              <span className="text-xs font-semibold text-navy-100">
                {b.remaining} <span className="text-navy-500 font-normal">/ {b.quota} left</span>
              </span>
            </div>
            <div className="h-1.5 bg-navy-600 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-signal-danger' : pct >= 80 ? 'bg-signal-warning' : 'bg-signal-success'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Submit form ──────────────────────────────────────────────────────────────
function SubmitForm({ isReviewer, employees, onSubmitted }) {
  const [leaveType,  setLeaveType]  = useState('sick_leave')
  const [startDate,  setStartDate]  = useState('')
  const [endDate,    setEndDate]    = useState('')
  const [notes,      setNotes]      = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [busy,   setBusy]   = useState(false)
  const [error,  setError]  = useState('')
  const [balance, setBalance] = useState(null)

  // Load balance whenever the relevant employee changes
  useEffect(() => {
    setBalance(null)
    if (isReviewer && employeeId) {
      getEmployeeLeaveBalance(employeeId).then(r => setBalance(r?.data)).catch(() => {})
    } else if (!isReviewer) {
      getMyLeaveBalance().then(r => setBalance(r?.data)).catch(() => {})
    }
  }, [isReviewer, employeeId])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!startDate || !endDate) { setError('Start and end dates are required.'); return }
    if (startDate > endDate)    { setError('Start date must be on or before end date.'); return }

    setBusy(true)
    try {
      if (isReviewer) {
        if (!employeeId) { setError('Select an employee.'); setBusy(false); return }
        await createLeave({ employeeId, leaveType, startDate, endDate, notes })
      } else {
        await createMyLeave({ leaveType, startDate, endDate, notes })
      }
      setLeaveType('sick_leave')
      setStartDate('')
      setEndDate('')
      setNotes('')
      setEmployeeId('')
      setBalance(null)
      onSubmitted()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const inputCls = 'field-base text-xs w-full'
  const days = startDate && endDate && startDate <= endDate ? dayCount(startDate, endDate) : 0

  return (
    <form onSubmit={submit} className="bg-navy-700 rounded-lg border border-navy-500/60 p-5 space-y-4">
      <h4 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">File a Leave Request</h4>

      {balance && <BalanceBar balance={balance} />}

      {error && (
        <p className="text-xs text-signal-danger bg-signal-danger/8 border border-signal-danger/30 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {isReviewer && (
        <div>
          <label className="label-caps block mb-1">Employee</label>
          <select className={inputCls} value={employeeId} onChange={e => setEmployeeId(e.target.value)} required>
            <option value="">{employees.length === 0 ? 'Loading employees…' : 'Select employee…'}</option>
            {employees.map(emp => (
              <option key={emp._id || emp.id} value={emp._id || emp.id}>
                {emp.firstName} {emp.lastName}
                {emp.employeeCode ? ` (#${emp.employeeCode})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="label-caps block mb-1">Leave Type</label>
        <select className={inputCls} value={leaveType} onChange={e => setLeaveType(e.target.value)}>
          <option value="sick_leave">Sick Leave</option>
          <option value="vacation_leave">Vacation Leave</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label-caps block mb-1">Start Date</label>
          <input type="date" className={inputCls} value={startDate}
            onChange={e => { setStartDate(e.target.value); if (!endDate || e.target.value > endDate) setEndDate(e.target.value) }} />
        </div>
        <div>
          <label className="label-caps block mb-1">End Date</label>
          <input type="date" className={inputCls} value={endDate} min={startDate}
            onChange={e => setEndDate(e.target.value)} />
        </div>
      </div>

      {days > 0 && (
        <p className="text-2xs text-navy-400">
          {days} calendar day{days !== 1 ? 's' : ''} — all dates will be marked as paid leave on approval.
        </p>
      )}

      <div>
        <label className="label-caps block mb-1">Reason / Notes</label>
        <textarea rows={2} className="field-base w-full px-3 py-2 text-sm resize-none"
          placeholder="Optional reason or details…"
          value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <button type="submit" disabled={busy}
        className="w-full py-2 bg-accent text-white text-xs font-semibold rounded-md hover:bg-accent-400 disabled:opacity-50 transition-colors">
        {busy ? 'Submitting…' : 'Submit Request'}
      </button>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Leaves() {
  const { user } = useAuth()
  const isReviewer = REVIEWER_ROLES.includes(user?.role)

  const [leaves,    setLeaves]    = useState([])
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('pending')
  const [reviewTarget, setReviewTarget] = useState(null)  // { leave, action }
  const [notice,    setNotice]    = useState('')

  const [myBalance, setMyBalance] = useState(null)

  const loadBalance = useCallback(() => {
    if (!isReviewer) {
      getMyLeaveBalance().then(r => setMyBalance(r?.data)).catch(() => {})
    }
  }, [isReviewer])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const fn = isReviewer ? getLeaves : getMyLeaves
      const params = filter && filter !== 'all' ? { status: filter } : {}
      const res = await fn(params)
      setLeaves(res?.data || [])
    } catch (_) {}
    setLoading(false)
  }, [isReviewer, filter])

  useEffect(() => { load(); loadBalance() }, [load, loadBalance])

  useEffect(() => {
    if (isReviewer) {
      getEmployees().then(r => setEmployees(r?.data || [])).catch(() => {})
    }
  }, [isReviewer])

  const handleReview = (leave, action) => setReviewTarget({ leave, action })

  const confirmReview = async (leave, action, notes) => {
    try {
      if (action === 'approve') await approveLeave(leave.id, notes)
      else                      await rejectLeave(leave.id, notes)
      setNotice(`Leave ${action === 'approve' ? 'approved' : 'rejected'}.`)
      setTimeout(() => setNotice(''), 3000)
    } catch (err) {
      setNotice(`Error: ${err.message}`)
      setTimeout(() => setNotice(''), 4000)
    }
    setReviewTarget(null)
    load()
  }

  const FILTERS = isReviewer
    ? [
        { key: 'pending',  label: 'Pending'  },
        { key: 'approved', label: 'Approved' },
        { key: 'rejected', label: 'Rejected' },
        { key: 'all',      label: 'All'      },
      ]
    : [
        { key: 'pending',  label: 'Pending'  },
        { key: 'approved', label: 'Approved' },
        { key: 'rejected', label: 'Rejected' },
      ]

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-navy-500 bg-navy-800">
        <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">Leave Requests</h1>
        {notice && (
          <p className={`text-xs font-medium ${notice.startsWith('Error') ? 'text-signal-danger' : 'text-signal-success'}`}>
            {notice}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Submit form */}
          <SubmitForm
            isReviewer={isReviewer}
            employees={employees}
            onSubmitted={() => { load(); setFilter('pending') }}
          />

          {/* Filter tabs */}
          <div className="flex gap-1">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filter === f.key
                    ? 'bg-accent text-white'
                    : 'text-navy-400 hover:text-navy-100 hover:bg-navy-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* List */}
          {loading ? (
            <p className="text-center py-8 text-navy-400 text-xs">Loading…</p>
          ) : leaves.length === 0 ? (
            <div className="text-center py-12 text-navy-400">
              <p className="text-sm">No {filter !== 'all' ? filter : ''} leave requests.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {leaves.map(leave => (
                <LeaveCard
                  key={leave.id}
                  leave={leave}
                  isReviewer={isReviewer}
                  onReview={handleReview}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {reviewTarget && (
        <ReviewModal
          leave={reviewTarget.leave}
          action={reviewTarget.action}
          onConfirm={confirmReview}
          onCancel={() => setReviewTarget(null)}
        />
      )}
    </div>
  )
}
