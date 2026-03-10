/**
 * Payroll Runs Page
 * Create draft → compute → submit → approve → finalize workflow.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  getPayrollRuns, getPayrollRun, createPayrollRun,
  computePayrollRun, submitPayrollRun, approvePayrollRun, finalizePayrollRun
} from '../config/api'
import { useAuth } from '../contexts/AuthContext'

const STATUS_COLOR = {
  draft:            'bg-gray-100 text-gray-700',
  pending_approval: 'bg-yellow-100 text-yellow-700',
  approved:         'bg-blue-100 text-blue-700',
  finalized:        'bg-green-100 text-green-700',
}

function fmt(n)   { return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
function fmtH(n)  { return Number(n || 0).toFixed(2) + 'h' }
function fmtM(n)  { return Number(n || 0) + 'm' }

function RunListRow({ run, onSelect, selected }) {
  return (
    <tr
      onClick={() => onSelect(run._id)}
      className={`cursor-pointer hover:bg-blue-50 ${selected ? 'bg-blue-50' : ''}`}
    >
      <td className="px-4 py-3 text-gray-600 text-sm">
        {new Date(run.cutoffStart).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} –{' '}
        {new Date(run.cutoffEnd).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[run.status]}`}>
          {run.status.replace('_', ' ')}
        </span>
      </td>
      <td className="px-4 py-3 text-right text-sm">{fmt(run.totalGross)}</td>
      <td className="px-4 py-3 text-right text-sm text-gray-500">{fmt(run.totalDeductions)}</td>
      <td className="px-4 py-3 text-right text-sm font-semibold text-green-700">{fmt(run.totalNet)}</td>
    </tr>
  )
}

function NewRunModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    cutoffStart: '',
    cutoffEnd:   '',
    notes:       ''
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const submit = async () => {
    if (!form.cutoffStart || !form.cutoffEnd) { setError('Both dates are required'); return }
    setSaving(true); setError('')
    try {
      const res = await createPayrollRun(form)
      onCreate(res.data)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  // Quick-fill: current semi-monthly period
  const fillSemiMonthly = () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    if (now.getDate() <= 15) {
      setForm(p => ({ ...p, cutoffStart: `${y}-${String(m+1).padStart(2,'0')}-01`, cutoffEnd: `${y}-${String(m+1).padStart(2,'0')}-15` }))
    } else {
      const last = new Date(y, m+1, 0).getDate()
      setForm(p => ({ ...p, cutoffStart: `${y}-${String(m+1).padStart(2,'0')}-16`, cutoffEnd: `${y}-${String(m+1).padStart(2,'0')}-${last}` }))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">Create Payroll Run</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
          <button onClick={fillSemiMonthly} className="text-xs text-blue-600 hover:underline">
            Auto-fill current semi-monthly period
          </button>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cutoff Start *</label>
            <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.cutoffStart} onChange={e => setForm(p => ({ ...p, cutoffStart: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cutoff End *</label>
            <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.cutoffEnd} onChange={e => setForm(p => ({ ...p, cutoffEnd: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={2}
              value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PayslipTable({ run }) {
  const items = run.payslipItems || []
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            {['Employee', 'Basic', 'OT', 'Holiday', 'Night Diff', 'Allowances', 'Gross', 'SSS', 'PhilHealth', 'PagIbig', 'Tax', 'Other Ded.', 'Total Ded.', 'Net Pay'].map(h => (
              <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.length === 0 ? (
            <tr><td colSpan={14} className="text-center py-6 text-gray-400">No payslip items yet. Click "Compute" first.</td></tr>
          ) : items.map((p, i) => (
            <tr key={i} className={`hover:bg-gray-50 ${p.error ? 'bg-red-50' : ''}`}>
              <td className="px-3 py-2 font-medium whitespace-nowrap">{p.employeeName || p.employeeCode}</td>
              <td className="px-3 py-2 text-right">{fmt(p.basicPay)}</td>
              <td className="px-3 py-2 text-right">{fmt(p.overtimePay)}</td>
              <td className="px-3 py-2 text-right">{fmt(p.holidayPay)}</td>
              <td className="px-3 py-2 text-right">{fmt(p.nightDiffPay)}</td>
              <td className="px-3 py-2 text-right">{fmt(p.allowances)}</td>
              <td className="px-3 py-2 text-right font-medium">{fmt(p.grossPay)}</td>
              <td className="px-3 py-2 text-right text-red-600">{fmt(p.sssContribution)}</td>
              <td className="px-3 py-2 text-right text-red-600">{fmt(p.philHealthContribution)}</td>
              <td className="px-3 py-2 text-right text-red-600">{fmt(p.pagIbigContribution)}</td>
              <td className="px-3 py-2 text-right text-red-600">{fmt(p.withholdingTax)}</td>
              <td className="px-3 py-2 text-right text-red-600">{fmt(p.otherDeductions)}</td>
              <td className="px-3 py-2 text-right text-red-600 font-medium">{fmt(p.totalDeductions)}</td>
              <td className="px-3 py-2 text-right text-green-700 font-bold">{p.error ? <span className="text-red-600 text-xs">{p.error}</span> : fmt(p.netPay)}</td>
            </tr>
          ))}
        </tbody>
        {items.length > 0 && (
          <tfoot className="bg-gray-100">
            <tr>
              <td className="px-3 py-2 font-bold">Totals</td>
              <td colSpan={5} />
              <td className="px-3 py-2 text-right font-bold">{fmt(run.totalGross)}</td>
              <td colSpan={5} />
              <td className="px-3 py-2 text-right font-bold text-red-700">{fmt(run.totalDeductions)}</td>
              <td className="px-3 py-2 text-right font-bold text-green-700">{fmt(run.totalNet)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

export default function PayrollRuns() {
  const { user } = useAuth()
  const canApprove  = ['super_admin', 'client_admin'].includes(user?.role)
  const canCompute  = ['super_admin', 'client_admin', 'hr_payroll'].includes(user?.role)

  const [runs,       setRuns]       = useState([])
  const [selected,   setSelected]   = useState(null) // full run object
  const [loading,    setLoading]    = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showNew,    setShowNew]    = useState(false)
  const [msg,        setMsg]        = useState('')

  const loadList = useCallback(async () => {
    setLoading(true)
    try { setRuns((await getPayrollRuns())?.data || []) }
    catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadList() }, [loadList])

  const selectRun = async (id) => {
    try {
      const res = await getPayrollRun(id)
      setSelected(res?.data)
    } catch (err) { console.error(err) }
  }

  const action = async (fn, label) => {
    if (!selected) return
    setActionLoading(true); setMsg('')
    try {
      const res = await fn(selected._id)
      setSelected(res?.data)
      loadList()
      setMsg(`✅ ${label} successful`)
    } catch (err) { setMsg('❌ ' + err.message) }
    finally { setActionLoading(false) }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Payroll Runs</h2>
        {canCompute && (
          <button onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            + New Run
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Run list */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading…</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Period</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Gross</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Ded.</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-400">No runs yet</td></tr>
                ) : runs.map(r => (
                  <RunListRow key={r._id} run={r} selected={selected?._id === r._id} onSelect={selectRun} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Run detail */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-gray-400">
              Select a payroll run to view details
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="p-5 border-b">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-800">
                      {new Date(selected.cutoffStart).toLocaleDateString('en-PH')} – {new Date(selected.cutoffEnd).toLocaleDateString('en-PH')}
                    </h3>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[selected.status]}`}>
                      {selected.status.replace('_', ' ')}
                    </span>
                    {selected.notes && <p className="text-xs text-gray-500 mt-1">{selected.notes}</p>}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {canCompute && ['draft', 'pending_approval'].includes(selected.status) && (
                      <button disabled={actionLoading} onClick={() => action(computePayrollRun, 'Compute')}
                        className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                        {actionLoading ? '⏳' : '⚡'} Compute
                      </button>
                    )}
                    {canCompute && selected.status === 'draft' && (selected.payslipItems?.length > 0) && (
                      <button disabled={actionLoading} onClick={() => action(submitPayrollRun, 'Submit')}
                        className="px-3 py-1.5 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50">
                        Submit for Approval
                      </button>
                    )}
                    {canApprove && selected.status === 'pending_approval' && (
                      <button disabled={actionLoading} onClick={() => action(approvePayrollRun, 'Approval')}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        ✅ Approve
                      </button>
                    )}
                    {canApprove && selected.status === 'approved' && (
                      <button disabled={actionLoading}
                        onClick={() => { if (window.confirm('Finalize payroll? This cannot be undone.')) action(finalizePayrollRun, 'Finalize') }}
                        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                        🔒 Finalize
                      </button>
                    )}
                  </div>
                </div>

                {msg && <p className="mt-3 text-sm">{msg}</p>}

                {/* Summary row */}
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[['Total Gross', selected.totalGross, 'text-gray-800'],
                    ['Total Deductions', selected.totalDeductions, 'text-red-600'],
                    ['Total Net Pay', selected.totalNet, 'text-green-700']].map(([l, v, c]) => (
                    <div key={l} className="bg-gray-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-500">{l}</p>
                      <p className={`font-bold ${c}`}>{fmt(v)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <PayslipTable run={selected} />
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <NewRunModal
          onClose={() => setShowNew(false)}
          onCreate={async (run) => {
            setShowNew(false)
            await loadList()
            selectRun(run._id)
          }}
        />
      )}
    </div>
  )
}
