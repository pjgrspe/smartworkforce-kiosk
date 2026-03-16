/**
 * Payroll Runs Page
 * Create draft → compute → submit → approve → finalize workflow.
 */

import { useState, useEffect, useCallback } from 'react'
import JSZip from 'jszip'
import {
  getPayrollRuns, getPayrollRun, createPayrollRun,
  computePayrollRun, submitPayrollRun, approvePayrollRun, finalizePayrollRun, deletePayrollRun,
  getBranches, getTenantSettings, verifyPassword,
} from '../config/api'
import { useAuth } from '../contexts/AuthContext'
import { hasFreshSensitiveAuth, markSensitiveAuthNow } from '../lib/sensitiveAuth'
import { fmtDateRange, fmtPeso } from '../lib/format'
import { buildPayslipZipFileName, exportPayslipPdf, exportRunExcel } from '../lib/payrollExport'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import { Input, Select, Textarea } from '../components/ui/Input'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'

const STATUS_VARIANT = {
  draft:            'neutral',
  pending_approval: 'warning',
  approved:         'blue',
  finalized:        'success',
}

// ── Run List Item ─────────────────────────────────────────────────────
function resolveRunBranch(run, branches = []) {
  if (!run?.branchId) return null
  if (typeof run.branchId === 'object') {
    const id = run.branchId._id || run.branchId.id
    if (run.branchId.name || run.branchId.code) return run.branchId
    if (!id) return null
    return branches.find((branch) => String(branch._id) === String(id)) || null
  }
  return branches.find((branch) => String(branch._id) === String(run.branchId)) || null
}

function getRunBranchLabel(run, branches = []) {
  const branch = resolveRunBranch(run, branches)
  if (!branch) return 'All branches'
  return branch.name || branch.code || 'Assigned branch'
}

function RunListItem({ run, onSelect, selected, branches }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(run._id)}
      className={`run-nav-item relative w-full text-left px-5 py-4 transition-colors duration-80
                  ${selected
                    ? 'run-nav-item-active text-navy-50 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-accent'
                    : 'text-navy-200 hover:text-navy-50 hover:bg-navy-700/40'}`}
    >
      <p className="text-xs font-semibold text-navy-100">
        {fmtDateRange(run.cutoffStart, run.cutoffEnd)}
      </p>
      <p className="mt-1 text-2xs text-navy-300">{getRunBranchLabel(run, branches)}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge variant={STATUS_VARIANT[run.status] ?? 'neutral'}>
          {run.status?.replace('_', ' ')}
        </Badge>
        <span className="text-xs tabular font-semibold text-signal-success">{fmtPeso(run.totalNet)}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-2xs">
        <div>
          <p className="label-caps !text-[10px] !tracking-[0.16em]">Gross</p>
          <p className="mt-1 tabular text-navy-200">{fmtPeso(run.totalGross)}</p>
        </div>
        <div className="text-right">
          <p className="label-caps !text-[10px] !tracking-[0.16em]">Deductions</p>
          <p className="mt-1 tabular text-signal-danger/90">{fmtPeso(run.totalDeductions)}</p>
        </div>
      </div>
    </button>
  )
}

// ── New Run Modal ─────────────────────────────────────────────────────
function NewRunModal({ onClose, onCreate, onCreated, branches, currentUser }) {
  const branchLocked = !['super_admin', 'client_admin'].includes(currentUser?.role) && !!currentUser?.branchId
  const [form, setForm]   = useState({
    cutoffStart: '',
    cutoffEnd: '',
    notes: '',
    branchId: branchLocked ? currentUser.branchId : (branches[0]?._id || ''),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (branchLocked) {
      setForm((prev) => ({ ...prev, branchId: currentUser.branchId }))
      return
    }
    if (!form.branchId && branches.length > 0) {
      setForm((prev) => ({ ...prev, branchId: branches[0]._id }))
    }
  }, [branchLocked, currentUser?.branchId, branches, form.branchId])

  const submit = async () => {
    if (!form.cutoffStart || !form.cutoffEnd) { setError('Both dates are required'); return }
    if (!form.branchId) { setError('Branch is required'); return }
    setSaving(true); setError('')
    try {
      const res = await onCreate(form)
      onCreated?.(res?.data || res)
    }
    catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const fillSemiMonthly = () => {
    const now = new Date(); const y = now.getFullYear(); const m = now.getMonth()
    if (now.getDate() <= 15) {
      setForm(p => ({ ...p,
        cutoffStart: `${y}-${String(m + 1).padStart(2, '0')}-01`,
        cutoffEnd:   `${y}-${String(m + 1).padStart(2, '0')}-15`,
      }))
    } else {
      const last = new Date(y, m + 1, 0).getDate()
      setForm(p => ({ ...p,
        cutoffStart: `${y}-${String(m + 1).padStart(2, '0')}-16`,
        cutoffEnd:   `${y}-${String(m + 1).padStart(2, '0')}-${last}`,
      }))
    }
  }

  return (
    <Modal
      title="Create Payroll Run"
      subtitle="Creating a run will compute payroll immediately for the selected cutoff."
      width="max-w-md"
      onClose={onClose}
      onConfirm={submit}
      confirmLabel={saving ? 'Creating...' : 'Create and Compute'}
      loading={saving}
    >
      <div className="space-y-3">
        {error && (
          <p className="text-2xs text-signal-danger px-3 py-2 bg-signal-danger/8
                        border border-signal-danger/25 rounded-md">{error}</p>
        )}
        <button onClick={fillSemiMonthly}
          className="text-2xs text-accent hover:text-accent-200 transition-colors">
          Auto-fill current semi-monthly period
        </button>
        <Input type="date" label="Cutoff Start *" value={form.cutoffStart}
          onChange={e => setForm(p => ({ ...p, cutoffStart: e.target.value }))} />
        <Input type="date" label="Cutoff End *" value={form.cutoffEnd}
          onChange={e => setForm(p => ({ ...p, cutoffEnd: e.target.value }))} />
        <Select label={branchLocked ? 'Branch (Locked)' : 'Branch'} value={form.branchId}
          onChange={e => setForm(p => ({ ...p, branchId: e.target.value }))} disabled={branchLocked}>
          {branches.map(branch => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
        </Select>
        <Textarea label="Notes" rows={2} value={form.notes}
          onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
      </div>
    </Modal>
  )
}

// ── Payslip Table ─────────────────────────────────────────────────────
function PayslipTable({ run, onExportPayslip, exportingEmployeeId }) {
  const items = run.payslipItems || []
  const cols = [
    'Employee', 'Basic', 'OT', 'Holiday', 'Night Diff', 'Allow.',
    'Gross', 'SSS', 'PhilHealth', 'PagIbig', 'Tax', 'Other', 'Total Ded.', 'Net', 'Export',
  ]
  return (
    <div className="table-shell overflow-x-auto border-t border-navy-500">
      <table className="table-base text-2xs">
        <thead>
          <tr className="table-head-row">
            {cols.map(h => (
              <th key={h} className="table-th whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={cols.length} className="table-empty">
                No payslip items yet — click Compute first.
              </td>
            </tr>
          ) : items.map((p, i) => (
            <tr key={i}
                className={`table-row ${p.error ? 'bg-signal-danger/5' : i % 2 !== 0 ? 'table-row-alt' : ''}`}>
              <td className="px-4 py-2.5 font-medium text-navy-100 whitespace-nowrap">
                {p.employeeName || p.employeeCode}
              </td>
              {[p.basicPay, p.overtimePay, p.holidayPay, p.nightDiffPay, p.allowances].map((v, j) => (
                <td key={j} className="px-4 py-2.5 text-right tabular text-navy-200">{fmtPeso(v)}</td>
              ))}
              <td className="px-4 py-2.5 text-right tabular font-medium text-navy-50">{fmtPeso(p.grossPay)}</td>
              {[p.sssContribution, p.philHealthContribution, p.pagIbigContribution, p.withholdingTax, p.otherDeductions].map((v, j) => (
                <td key={j} className="px-4 py-2.5 text-right tabular text-signal-danger/80">{fmtPeso(v)}</td>
              ))}
              <td className="px-4 py-2.5 text-right tabular font-medium text-signal-danger/80">{fmtPeso(p.totalDeductions)}</td>
              <td className="px-4 py-2.5 text-right tabular font-bold text-signal-success">
                {p.error
                  ? <span className="text-signal-danger">{p.error}</span>
                  : fmtPeso(p.netPay)}
              </td>
              <td className="px-4 py-2.5 text-right">
                {!p.error ? (
                  <button
                    type="button"
                    onClick={() => onExportPayslip(p)}
                    disabled={exportingEmployeeId === p.employeeId}
                    className="text-2xs font-medium text-accent hover:text-accent-200 transition-colors disabled:opacity-50 disabled:cursor-wait"
                  >
                    {exportingEmployeeId === p.employeeId ? 'Exporting...' : 'PDF'}
                  </button>
                ) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        {items.length > 0 && (
          <tfoot>
            <tr className="bg-navy-600/40 border-t border-navy-500">
              <td className="px-4 py-2.5 font-bold text-navy-100" colSpan={6}>Totals</td>
              <td className="px-4 py-2.5 text-right tabular font-bold text-navy-50">{fmtPeso(run.totalGross)}</td>
              <td colSpan={5} />
              <td className="px-4 py-2.5 text-right tabular font-bold text-signal-danger">{fmtPeso(run.totalDeductions)}</td>
              <td className="px-4 py-2.5 text-right tabular font-bold text-signal-success">{fmtPeso(run.totalNet)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────
export default function PayrollRuns() {
  const { user } = useAuth()
  const canApprove = ['super_admin', 'client_admin'].includes(user?.role)
  const canCompute = ['super_admin', 'client_admin', 'hr_payroll'].includes(user?.role)
  const canDeleteAny = ['super_admin', 'client_admin'].includes(user?.role)
  const canDeleteFinalized = user?.role === 'super_admin'

  const [runs,          setRuns]          = useState([])
  const [branches,      setBranches]      = useState([])
  const [tenant,        setTenant]        = useState(null)
  const [selected,      setSelected]      = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [excelLoading,  setExcelLoading]  = useState(false)
  const [zipLoading,    setZipLoading]    = useState(false)
  const [exportingEmployeeId, setExportingEmployeeId] = useState(null)
  const [showNew,       setShowNew]       = useState(false)
  const [msg,           setMsg]           = useState({ text: '', ok: true })
  const [reauthOpen, setReauthOpen] = useState(false)
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthError, setReauthError] = useState('')
  const [reauthLoading, setReauthLoading] = useState(false)
  const [pendingSensitiveAction, setPendingSensitiveAction] = useState(null)
  const createRunCore = async (payload) => createPayrollRun(payload)

  const requestSensitiveAction = (action) => {
    if (hasFreshSensitiveAuth()) {
      if (action.type === 'new_run_open') {
        setShowNew(true)
      }
      if (action.type === 'compute') {
        runAction(computePayrollRun, 'Compute')
      }
      if (action.type === 'submit') {
        runAction(submitPayrollRun, 'Submit')
      }
      if (action.type === 'approve') {
        runAction(approvePayrollRun, 'Approval')
      }
      if (action.type === 'finalize') {
        if (window.confirm('Finalize payroll? This cannot be undone.')) {
          runAction(finalizePayrollRun, 'Finalize')
        }
      }
      if (action.type === 'delete') {
        handleDelete()
      }
      return
    }

    setPendingSensitiveAction(action)
    setReauthPassword('')
    setReauthError('')
    setReauthOpen(true)
  }

  const confirmSensitiveAuth = async () => {
    if (!reauthPassword) {
      setReauthError('Password is required')
      return
    }

    setReauthLoading(true)
    setReauthError('')
    try {
      await verifyPassword(reauthPassword)
      markSensitiveAuthNow()
      const action = pendingSensitiveAction
      setPendingSensitiveAction(null)
      setReauthOpen(false)
      setReauthPassword('')

      if (action?.type === 'new_run_open') {
        setShowNew(true)
      }
      if (action?.type === 'compute') {
        await runAction(computePayrollRun, 'Compute')
      }
      if (action?.type === 'submit') {
        await runAction(submitPayrollRun, 'Submit')
      }
      if (action?.type === 'approve') {
        await runAction(approvePayrollRun, 'Approval')
      }
      if (action?.type === 'finalize') {
        if (window.confirm('Finalize payroll? This cannot be undone.')) {
          await runAction(finalizePayrollRun, 'Finalize')
        }
      }
      if (action?.type === 'delete') {
        await handleDelete()
      }
    } catch (err) {
      setReauthError(err.message || 'Password verification failed')
    } finally {
      setReauthLoading(false)
    }
  }


  const loadList = useCallback(async () => {
    setLoading(true)
    try { setRuns((await getPayrollRuns())?.data || []) }
    catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadList() }, [loadList])
  useEffect(() => {
    getBranches().then((response) => setBranches(response?.data || [])).catch(() => {})
    getTenantSettings().then((response) => setTenant(response?.data || null)).catch(() => {})
  }, [])

  const selectRun = async (id) => {
    try { setSelected((await getPayrollRun(id))?.data) }
    catch (err) { console.error(err) }
  }

  const runAction = async (fn, label) => {
    if (!selected) return
    setActionLoading(true); setMsg({ text: '', ok: true })
    try {
      setSelected((await fn(selected._id))?.data)
      loadList()
      setMsg({ text: `${label} completed.`, ok: true })
    } catch (err) { setMsg({ text: err.message, ok: false }) }
    finally { setActionLoading(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    if (selected.status === 'finalized' && !canDeleteFinalized) {
      setMsg({ text: 'Only super admins can delete finalized payroll runs.', ok: false })
      return
    }
    if (!window.confirm('Delete this payroll run? This action cannot be undone.')) return

    setActionLoading(true); setMsg({ text: '', ok: true })
    try {
      await deletePayrollRun(selected._id)
      setRuns(prev => prev.filter(r => r._id !== selected._id))
      setSelected(null)
      setMsg({ text: 'Payroll run deleted.', ok: true })
    } catch (err) {
      setMsg({ text: err.message, ok: false })
    } finally {
      setActionLoading(false)
    }
  }

  const handleExportRunExcel = async () => {
    if (!selected || !selected.payslipItems?.length) return
    setExcelLoading(true)
    setMsg({ text: '', ok: true })
    try {
      const resolvedBranch = resolveRunBranch(selected, branches)
      const runForExport = { ...selected, branchId: resolvedBranch || null }
      const result = await exportRunExcel(runForExport, tenant)
      setMsg({ text: `Payroll run exported to Excel${result?.fileName ? ` (${result.fileName})` : ''}.`, ok: true })
    } catch (err) {
      setMsg({ text: err.message || 'Failed to export payroll run.', ok: false })
    } finally {
      setExcelLoading(false)
    }
  }

  const handleExportPayslip = async (payslip) => {
    if (!selected) return
    setExportingEmployeeId(payslip.employeeId)
    setMsg({ text: '', ok: true })
    try {
      const resolvedBranch = resolveRunBranch(selected, branches)
      const runForExport = { ...selected, branchId: resolvedBranch || null }
      const result = await exportPayslipPdf(runForExport, payslip, tenant)
      setMsg({
        text: `Payslip exported for ${payslip.employeeName || payslip.employeeCode}${result?.fileName ? ` (${result.fileName})` : ''}.`,
        ok: true,
      })
    } catch (err) {
      setMsg({ text: err.message || 'Failed to export payslip.', ok: false })
    } finally {
      setExportingEmployeeId(null)
    }
  }

  const handleExportAllPayslipsZip = async () => {
    if (!selected || !selected.payslipItems?.length) return

    const exportablePayslips = selected.payslipItems.filter((item) => !item.error)
    if (!exportablePayslips.length) {
      setMsg({ text: 'No valid payslips to include in ZIP.', ok: false })
      return
    }

    setZipLoading(true)
    setMsg({ text: '', ok: true })

    try {
      const resolvedBranch = resolveRunBranch(selected, branches)
      const runForExport = { ...selected, branchId: resolvedBranch || null }
      const zip = new JSZip()

      for (const payslip of exportablePayslips) {
        const { fileName, blob } = await exportPayslipPdf(runForExport, payslip, tenant, { returnBlob: true })
        zip.file(fileName, blob)
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const zipFileName = buildPayslipZipFileName(runForExport)
      const downloadUrl = URL.createObjectURL(zipBlob)
      const anchor = document.createElement('a')
      anchor.href = downloadUrl
      anchor.download = zipFileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(downloadUrl)

      setMsg({ text: `Payslip ZIP exported (${zipFileName}).`, ok: true })
    } catch (err) {
      setMsg({ text: err.message || 'Failed to export payslip ZIP.', ok: false })
    } finally {
      setZipLoading(false)
    }
  }

  const summaryTiles = selected ? [
    { label: 'Total Gross',      value: selected.totalGross,      color: 'text-navy-50' },
    { label: 'Total Deductions', value: selected.totalDeductions, color: 'text-signal-danger' },
    { label: 'Total Net Pay',    value: selected.totalNet,        color: 'text-signal-success' },
  ] : []

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-3.5
                      border-b border-navy-500 bg-navy-800">
        <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">
          Payroll Runs
        </h1>
        {canCompute && (
          <Button variant="primary" size="sm" onClick={() => requestSensitiveAction({ type: 'new_run_open' })}>
            + New Run
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto px-4 pb-6 xl:pl-0 xl:pr-6">
        <div className="grid min-h-full grid-cols-12 gap-6 items-stretch">

          {/* Left: run navigator */}
          <aside className="run-nav-shell col-span-12 overflow-hidden rounded-lg border xl:col-span-3 xl:min-h-full xl:rounded-none xl:border-y-0 xl:border-l-0 xl:border-r">
            <div className="flex h-full min-h-[32rem] flex-col xl:sticky xl:top-0 xl:max-h-[calc(100vh-3.5rem)]">
              <div className="run-nav-header border-b px-5 py-5">
                <p className="label-caps">Payroll</p>
                <p className="mt-1 text-sm font-semibold text-navy-100">Runs</p>
                <p className="mt-2 text-xs text-navy-300">{runs.length} total periods</p>
                <p className="mt-1 text-2xs text-navy-400">
                  {user?.branchId ? 'Scoped to your assigned branch' : 'Branch-aware payroll register'}
                </p>
              </div>

              {loading ? (
                <div className="flex flex-1 items-center justify-center px-4"><Spinner size="lg" /></div>
              ) : runs.length === 0 ? (
                <div className="flex flex-1 items-center justify-center px-6 text-center">
                  <p className="text-sm text-navy-300">No payroll runs yet.</p>
                </div>
              ) : (
                <div className="run-nav-list flex-1 overflow-auto py-0">
                  <div className="run-nav-divider border-y">
                    {runs.map(r => (
                      <div key={r._id} className="run-nav-divider border-b last:border-b-0">
                        <RunListItem
                          run={r}
                          selected={selected?._id === r._id}
                          onSelect={selectRun}
                          branches={branches}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* Right: detail workspace */}
          <section className="col-span-12 xl:col-span-9 min-w-0 space-y-4 px-2 pt-4 xl:px-0 xl:pt-6">
            {!selected ? (
              <div className="table-shell min-h-[320px] flex items-center justify-center">
                <div className="text-center px-6">
                  <p className="label-caps">No Run Selected</p>
                  <p className="mt-2 text-sm text-navy-300">Choose a payroll run from the left panel to view details.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="table-shell p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="label-caps">Selected Run</p>
                      <p className="text-lg font-semibold text-navy-50 mt-1">
                        {fmtDateRange(selected.cutoffStart, selected.cutoffEnd)}
                      </p>
                      <p className="mt-2 text-xs text-navy-300">{getRunBranchLabel(selected, branches)}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant={STATUS_VARIANT[selected.status] ?? 'neutral'}>
                          {selected.status?.replace('_', ' ')}
                        </Badge>
                        {selected.notes && (
                          <span className="text-xs text-navy-300">{selected.notes}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {selected.payslipItems?.length > 0 && (
                        <Button
                          variant="primary"
                          size="sm"
                          loading={excelLoading}
                          onClick={handleExportRunExcel}
                          className="bg-[#217346] border-[#1E6A3F] text-white hover:bg-[#1b613b]"
                        >
                          XLSX Report
                        </Button>
                      )}
                      {canCompute && ['draft', 'pending_approval'].includes(selected.status) && (
                        <Button variant="secondary" size="sm"
                          loading={actionLoading}
                          onClick={() => requestSensitiveAction({ type: 'compute' })}>
                          {selected.payslipItems?.length > 0 ? 'Recompute' : 'Compute'}
                        </Button>
                      )}
                      {canCompute && selected.status === 'draft'
                        && (selected.payslipItems?.length > 0) && (
                        <Button variant="outline" size="sm"
                          loading={actionLoading}
                          onClick={() => requestSensitiveAction({ type: 'submit' })}>
                          Submit for Approval
                        </Button>
                      )}
                      {canApprove && selected.status === 'pending_approval' && (
                        <Button variant="primary" size="sm"
                          loading={actionLoading}
                          onClick={() => requestSensitiveAction({ type: 'approve' })}>
                          Approve
                        </Button>
                      )}
                      {canApprove && selected.status === 'approved' && (
                        <Button variant="primary" size="sm"
                          loading={actionLoading}
                          onClick={() => requestSensitiveAction({ type: 'finalize' })}>
                          Finalize
                        </Button>
                      )}
                      {canDeleteAny && (selected.status !== 'finalized' || canDeleteFinalized) && (
                        <Button
                          variant="danger"
                          size="sm"
                          loading={actionLoading}
                          onClick={() => requestSensitiveAction({ type: 'delete' })}
                        >
                          Delete Run
                        </Button>
                      )}
                    </div>
                  </div>

                  {msg.text && (
                    <p className={`mt-3 text-xs ${msg.ok ? 'text-signal-success' : 'text-signal-danger'}`}>
                      {msg.text}
                    </p>
                  )}

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    {summaryTiles.map(t => (
                      <div key={t.label} className="bg-navy-600 border border-navy-500 rounded-md px-4 py-3">
                        <p className="label-caps mb-1">{t.label}</p>
                        <p className={`text-base font-bold tabular ${t.color}`}>{fmtPeso(t.value)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <p className="label-caps">Payslip Breakdown</p>
                    {selected.payslipItems?.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        loading={zipLoading}
                        onClick={handleExportAllPayslipsZip}
                        disabled={excelLoading || !!exportingEmployeeId}
                      >
                        Download All Payslips (ZIP)
                      </Button>
                    )}
                  </div>
                  <PayslipTable
                    run={selected}
                    onExportPayslip={handleExportPayslip}
                    exportingEmployeeId={exportingEmployeeId}
                  />
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {showNew && (
        <NewRunModal
          onClose={() => setShowNew(false)}
          branches={branches}
          currentUser={user}
          onCreate={async (formPayload) => createRunCore(formPayload)}
          onCreated={async (run) => {
            setShowNew(false)
            await loadList()
            await selectRun(run._id)
            setMsg({ text: 'Payroll run created and computed.', ok: true })
          }}
        />
      )}

      {reauthOpen && (
        <Modal
          title="Sensitive Action"
          subtitle="Re-enter your password to continue."
          width="max-w-md"
          onClose={() => { setReauthOpen(false); setPendingSensitiveAction(null) }}
          onConfirm={confirmSensitiveAuth}
          confirmLabel="Continue"
          loading={reauthLoading}
        >
          <div className="space-y-3">
            {reauthError && (
              <p className="text-2xs text-signal-danger px-3 py-2 bg-signal-danger/8 border border-signal-danger/25 rounded-md">
                {reauthError}
              </p>
            )}
            <Input
              label="Password"
              type="password"
              autoFocus
              value={reauthPassword}
              onChange={(e) => setReauthPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  confirmSensitiveAuth()
                }
              }}
            />
          </div>
        </Modal>
      )}

    </div>
  )
}


