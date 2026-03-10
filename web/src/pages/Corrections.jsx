/**
 * Corrections Page — attendance correction requests with approve/reject workflow.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  getCorrections, createCorrection, approveCorrection, rejectCorrection,
  getEmployees
} from '../config/api'
import { useAuth } from '../contexts/AuthContext'

const STATUS_BADGE = {
  pending:  'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const REASON_LABELS = {
  forgot_to_log: 'Forgot to log',
  device_down:   'Device down',
  field_work:    'Field work',
  system_error:  'System error',
  other:         'Other'
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none'

function ReviewModal({ correction, onClose, onDone }) {
  const [action, setAction]  = useState('approve')
  const [notes,  setNotes]   = useState('')
  const [saving, setSaving]  = useState(false)
  const [error,  setError]   = useState('')

  const emp = correction.employeeId
  const name = typeof emp === 'object' ? `${emp.firstName} ${emp.lastName}` : emp

  const submit = async () => {
    setSaving(true); setError('')
    try {
      action === 'approve'
        ? await approveCorrection(correction._id, notes)
        : await rejectCorrection(correction._id, notes)
      onDone()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">Review Correction</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
          <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
            <p><span className="font-medium">Employee:</span> {name}</p>
            <p><span className="font-medium">Date:</span> {new Date(correction.targetDate).toLocaleDateString('en-PH')}</p>
            <p><span className="font-medium">Reason:</span> {REASON_LABELS[correction.reasonCode]}</p>
            {correction.notes && <p><span className="font-medium">Notes:</span> {correction.notes}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Decision</label>
            <div className="flex gap-3">
              {['approve', 'reject'].map(a => (
                <label key={a} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="action" value={a} checked={action === a} onChange={() => setAction(a)} />
                  <span className={a === 'approve' ? 'text-green-700' : 'text-red-600'}>{a.charAt(0).toUpperCase() + a.slice(1)}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Review Notes</label>
            <textarea className={inputCls} rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving}
            className={`px-5 py-2 rounded-lg text-white disabled:opacity-50 ${action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
            {saving ? 'Saving…' : action === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NewCorrectionModal({ employees, onClose, onDone }) {
  const [form, setForm] = useState({
    employeeId: '', targetDate: '', reasonCode: 'forgot_to_log', notes: '',
    before: '', after: ''
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const submit = async () => {
    setSaving(true); setError('')
    try {
      await createCorrection({
        ...form,
        before: form.before ? { note: form.before } : undefined,
        after:  form.after  ? { note: form.after  } : undefined
      })
      onDone()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">New Correction Request</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Employee *</label>
            <select className={inputCls} value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e._id} value={e._id}>{e.firstName} {e.lastName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
            <input type="date" className={inputCls} value={form.targetDate} onChange={e => setForm(p => ({ ...p, targetDate: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason *</label>
            <select className={inputCls} value={form.reasonCode} onChange={e => setForm(p => ({ ...p, reasonCode: e.target.value }))}>
              {Object.entries(REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea className={inputCls} rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Corrections() {
  const { user } = useAuth()
  const canReview = ['super_admin', 'client_admin', 'hr_payroll', 'branch_manager'].includes(user?.role)

  const [corrections, setCorrections] = useState([])
  const [employees,   setEmployees]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [reviewTarget, setReviewTarget] = useState(null)
  const [showNew,      setShowNew]    = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, eRes] = await Promise.all([
        getCorrections(statusFilter ? { status: statusFilter } : {}),
        getEmployees()
      ])
      setCorrections(cRes?.data || [])
      setEmployees(eRes?.data   || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Attendance Corrections</h2>
        <button onClick={() => setShowNew(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          + New Request
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-6">
        {['pending', 'approved', 'rejected', ''].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Employee', 'Date', 'Reason', 'Requested By', 'Status', 'Reviewed By', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {corrections.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No corrections found</td></tr>
              ) : corrections.map(c => {
                const emp = c.employeeId
                const empName = typeof emp === 'object' ? `${emp.firstName} ${emp.lastName}` : '—'
                const reqBy   = c.requestedBy
                const reqName = typeof reqBy === 'object' ? reqBy.email : '—'
                const revBy   = c.reviewedBy
                const revName = typeof revBy === 'object' ? revBy.email : '—'
                return (
                  <tr key={c._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{empName}</td>
                    <td className="px-4 py-3 text-gray-600">{new Date(c.targetDate).toLocaleDateString('en-PH')}</td>
                    <td className="px-4 py-3">{REASON_LABELS[c.reasonCode]}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{reqName}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[c.status]}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{revBy ? revName : '—'}</td>
                    <td className="px-4 py-3">
                      {c.status === 'pending' && canReview && (
                        <button onClick={() => setReviewTarget(c)}
                          className="text-blue-600 hover:underline text-xs">Review</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

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
          onClose={() => setShowNew(false)}
          onDone={() => { setShowNew(false); load() }}
        />
      )}
    </div>
  )
}
