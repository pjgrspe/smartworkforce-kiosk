/**
 * Dashboard - high-density executive summary.
 * Layout: page header strip -> KPI rail -> 12-col grid (7 + 5).
 * Design: data-forward, monochromatic, tabular numbers.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  getEmployees, getAttendance, getCorrections, getPayrollRuns,
  getMyEmployeeProfile, getMyAttendance, getMyCorrections, createMyCorrection, getMyPayslips,
  getHealth, getSyncStatus,
} from '../config/api'
import { fmtDate, fmtTime, fmtDateRange, fmtPeso, fmtPesoShort, employeeName } from '../lib/format'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { Input, Textarea } from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'

function formatRelativeTime(value) {
  if (!value) return 'No recent check yet'

  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return 'No recent check yet'

  const diffMs = Date.now() - time.getTime()
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000))
  if (diffMinutes < 1) return 'Updated just now'
  if (diffMinutes === 1) return 'Updated 1 minute ago'
  if (diffMinutes < 60) return `Updated ${diffMinutes} minutes ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours === 1) return 'Updated 1 hour ago'
  if (diffHours < 24) return `Updated ${diffHours} hours ago`

  return `Updated ${fmtDate(time)} ${fmtTime(time)}`
}

function statusTone(value, goodValues = []) {
  return goodValues.includes(value) ? 'success' : 'warning'
}

function StatusMetric({ label, value, hint, tone = 'neutral' }) {
  const valueClass = {
    success: 'text-signal-success',
    warning: 'text-signal-warning',
    danger: 'text-signal-danger',
    info: 'text-accent-400',
    neutral: 'text-navy-50',
  }[tone] || 'text-navy-50'

  return (
    <div className="rounded-lg border border-navy-500/50 bg-navy-800/70 px-3 py-3">
      <p className="label-caps mb-1">{label}</p>
      <p className={`text-base font-semibold uppercase tracking-wide ${valueClass}`}>{value}</p>
      <p className="mt-1 text-2xs text-navy-300">{hint}</p>
    </div>
  )
}

function SyncObservabilityPanel({ branchId }) {
  const [status, setStatus] = useState(null)
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    let active = true

    const loadStatus = async (isInitialLoad = false) => {
      if (isInitialLoad) setLoading(true)

      try {
        const [healthRes, syncRes] = await Promise.all([
          getHealth(),
          getSyncStatus(branchId ? { branchId } : {}),
        ])

        if (!active) return

        setHealth(healthRes)
        setStatus(syncRes)
        setError('')
      } catch (err) {
        if (!active) return
        setError(err.message || 'Unable to load platform status')
      } finally {
        if (active && isInitialLoad) setLoading(false)
      }
    }

    loadStatus(true)
    const timer = window.setInterval(() => loadStatus(false), 15000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [branchId, refreshTick])

  const metrics = status?.metrics || {}
  const provider = health?.provider || status?.provider || 'unknown'
  const mode = health?.mode || status?.mode || 'unknown'
  const outboxPending = Number(metrics.outbox_pending || 0)
  const inboundFailures = Number(metrics.inbound_failures || 0)
  const deadLetter = Number(metrics.dead_letter || 0)
  const maxEventSeq = Number(metrics.max_event_seq || 0)

  return (
    <Panel title="Platform Status">
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-navy-100">Central runtime health</p>
            <p className="mt-1 text-2xs text-navy-300">{formatRelativeTime(health?.ts)}</p>
          </div>
          <Button size="xs" variant="outline" onClick={() => setRefreshTick((current) => current + 1)}>
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-navy-500/40 bg-navy-800/60 px-3 py-3 text-2xs text-navy-300">
            <Spinner size="sm" />
            Loading sync telemetry...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-signal-danger/25 bg-signal-danger/8 px-3 py-3 text-2xs text-signal-danger">
            {error}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatusMetric
                label="Provider"
                value={provider}
                hint="Active persistence layer"
                tone={statusTone(provider, ['postgres'])}
              />
              <StatusMetric
                label="Runtime"
                value={mode}
                hint="Deployment topology"
                tone={statusTone(mode, ['CENTRAL', 'BRANCH'])}
              />
              <StatusMetric
                label="Outbox Pending"
                value={String(outboxPending)}
                hint="Branch queue waiting to send"
                tone={outboxPending > 0 ? 'warning' : 'success'}
              />
              <StatusMetric
                label="Inbound Failures"
                value={String(inboundFailures)}
                hint="Retries currently tracked"
                tone={inboundFailures > 0 ? 'warning' : 'success'}
              />
              <StatusMetric
                label="Dead Letter"
                value={String(deadLetter)}
                hint="Events needing manual review"
                tone={deadLetter > 0 ? 'danger' : 'success'}
              />
              <StatusMetric
                label="Event Feed"
                value={String(maxEventSeq)}
                hint="Latest central sync sequence"
                tone="info"
              />
            </div>

            {Array.isArray(status?.checkpoints) && status.checkpoints.length > 0 && (
              <div className="rounded-lg border border-navy-500/40 bg-navy-800/40 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-navy-500/30">
                  <p className="label-caps">Branch Checkpoints</p>
                  <Badge variant="info">{status.checkpoints.length}</Badge>
                </div>
                <div className="divide-y divide-navy-500/25">
                  {status.checkpoints.map((checkpoint) => (
                    <div key={checkpoint.cursor_name} className="px-3 py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-2xs font-semibold uppercase tracking-wide text-navy-100">
                          {checkpoint.cursor_name.replace(/_/g, ' ')}
                        </p>
                        <p className="mt-1 text-2xs text-navy-300">{formatRelativeTime(checkpoint.updated_at)}</p>
                      </div>
                      <p className="max-w-[45%] truncate text-2xs text-navy-200">{checkpoint.cursor_value || 'None'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  )
}

// KPI tile
function KPI({ label, value, sub, accent, href }) {
  const nav = useNavigate()
  return (
    <div
      onClick={() => href && nav(href)}
      className={`
        relative flex flex-col justify-between p-4 border rounded-lg cursor-pointer
        bg-navy-700 hover:bg-navy-600 transition-colors duration-80 group overflow-hidden
        ${accent ? 'border-l-[2px] border-l-accent border-t-navy-500 border-r-navy-500 border-b-navy-500' : 'border-navy-500'}
      `}
    >
      <p className="label-caps mb-2">{label}</p>
      <p className="text-[28px] font-bold tabular text-navy-50 leading-none">
        {value ?? <span className="text-navy-500 font-normal">—</span>}
      </p>
      {sub && <p className="text-2xs text-navy-300 mt-1.5 font-mono">{sub}</p>}
      {/* Hover underline reveal */}
      <span className="absolute inset-x-0 bottom-0 h-px bg-accent
                       scale-x-0 group-hover:scale-x-100 transition-transform duration-120 origin-left" />
    </div>
  )
}

// Panel shell
function Panel({ title, action, actionHref, children }) {
  const nav = useNavigate()
  return (
    <div className="flex flex-col bg-navy-700 border border-navy-500 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-navy-500">
        <h3 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">
          {title}
        </h3>
        {action && (
          <button
            onClick={() => nav(actionHref)}
            className="text-2xs text-navy-400 hover:text-accent uppercase tracking-wider
                       transition-colors duration-80"
          >
            {action} →
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

// Punch type text
function PunchType({ type }) {
  const cls = {
    IN:    'text-signal-success',
    OUT:   'text-signal-danger',
    BREAK: 'text-signal-warning',
  }
  return (
    <span className={`font-mono text-2xs font-semibold uppercase tabular ${cls[type] ?? 'text-navy-400'}`}>
      {type}
    </span>
  )
}

function EmployeeDashboard() {
  const [employee, setEmployee] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [corrections, setCorrections] = useState([])
  const [payslips, setPayslips] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState({ text: '', ok: true })
  const [form, setForm] = useState({ date: '', reason: '', notes: '' })

  const loadSelfService = () => {
    setLoading(true)
    Promise.all([
      getMyEmployeeProfile().catch(() => ({ data: null })),
      getMyAttendance({ limit: 12 }).catch(() => ({ data: [] })),
      getMyCorrections().catch(() => ({ data: [] })),
      getMyPayslips().catch(() => ({ data: [] })),
    ]).then(([profileRes, attendanceRes, correctionRes, payslipRes]) => {
      setEmployee(profileRes?.data || null)
      setAttendance(attendanceRes?.data || [])
      setCorrections(correctionRes?.data || [])
      setPayslips(payslipRes?.data || [])
    }).finally(() => setLoading(false))
  }

  useEffect(() => {
    loadSelfService()
  }, [])

  const submitCorrection = async () => {
    if (!form.date || !form.reason.trim()) {
      setFeedback({ text: 'Date and reason are required.', ok: false })
      return
    }

    setSubmitting(true)
    setFeedback({ text: '', ok: true })
    try {
      await createMyCorrection(form)
      setForm({ date: '', reason: '', notes: '' })
      setFeedback({ text: 'Correction request submitted.', ok: true })
      loadSelfService()
    } catch (error) {
      setFeedback({ text: error.message, ok: false })
    } finally {
      setSubmitting(false)
    }
  }

  const todayStr = new Date().toDateString()
  const todayLatest = attendance
    .filter((log) => new Date(log.timestamp).toDateString() === todayStr)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]

  const currentStatus = (() => {
    if (!todayLatest) return 'No In Log'
    if (todayLatest.type === 'BREAK_OUT') return 'On Break'
    if (todayLatest.type === 'IN' || todayLatest.type === 'BREAK_IN') return 'Timed In'
    if (todayLatest.type === 'OUT') return 'Timed Out'
    return 'No In Log'
  })()

  const statusKpiCls = {
    'Timed In':  'text-signal-success',
    'On Break':  'text-signal-warning',
    'Timed Out': 'text-navy-300',
    'No In Log': 'text-navy-500',
  }[currentStatus] || 'text-navy-500'

  const pendingCorrections = corrections.filter((item) => item.status === 'pending').length
  const latestPayslip = payslips[0]?.payslip || null
  const employmentStatus = employee?.employment?.status || 'inactive'

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="label-caps">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-navy-500 bg-navy-800">
        <div>
          <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">My Workspace</h1>
          <p className="text-2xs text-navy-400 mt-0.5 font-mono">
            {[employee?.firstName, employee?.lastName].filter(Boolean).join(' ') || 'Employee self-service'}
          </p>
        </div>
        <Badge variant={employmentStatus === 'active' ? 'success' : 'neutral'}>{employmentStatus}</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5 pb-0">
        <KPI label="Today" value={<span className={statusKpiCls}>{currentStatus}</span>} sub={employee?.employeeCode || 'No employee code'} accent />
        <KPI label="Pending Requests" value={pendingCorrections} sub="Attendance corrections" />
        <KPI label="Latest Net Pay" value={latestPayslip ? fmtPeso(latestPayslip.netPay) : '—'} sub={payslips[0] ? fmtDateRange(payslips[0].cutoffStart, payslips[0].cutoffEnd) : 'No approved payslips'} />
        <KPI label="Branch" value={employee?.branchId?.name || 'Assigned'} sub={employee?.employment?.position || 'No position set'} />
      </div>

      <div className="flex-1 overflow-auto p-5 pt-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 max-w-[1600px]">
          <div className="lg:col-span-4 flex flex-col gap-4">
            <Panel title="Profile">
              <div className="px-4 py-4 space-y-3 text-sm text-navy-200">
                <div>
                  <p className="label-caps mb-1">Employee Code</p>
                  <p className="text-navy-50 font-medium">{employee?.employeeCode || '—'}</p>
                </div>
                <div>
                  <p className="label-caps mb-1">Position</p>
                  <p>{employee?.employment?.position || '—'}</p>
                </div>
                <div>
                  <p className="label-caps mb-1">Date Hired</p>
                  <p>{employee?.employment?.dateHired ? fmtDate(employee.employment.dateHired) : '—'}</p>
                </div>
                <div>
                  <p className="label-caps mb-1">Email</p>
                  <p>{employee?.email || '—'}</p>
                </div>
              </div>
            </Panel>

            <Panel title="Request Correction">
              <div className="px-4 py-4 space-y-3">
                {feedback.text && (
                  <p className={`text-2xs px-3 py-2 rounded-md border ${feedback.ok ? 'text-signal-success border-signal-success/25 bg-signal-success/8' : 'text-signal-danger border-signal-danger/25 bg-signal-danger/8'}`}>
                    {feedback.text}
                  </p>
                )}
                <Input label="Date *" type="date" value={form.date} onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))} />
                <Input label="Reason *" value={form.reason} placeholder="Forgot to time in" onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))} />
                <Textarea label="Notes" rows={3} value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
                <Button variant="primary" size="sm" loading={submitting} onClick={submitCorrection}>Submit Request</Button>
              </div>
            </Panel>
          </div>

          <div className="lg:col-span-8 flex flex-col gap-4">
            <Panel title="Recent Attendance">
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr className="table-head-row">
                      <th className="table-th">Date</th>
                      <th className="table-th">Time</th>
                      <th className="table-th">Type</th>
                      <th className="table-th">Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="table-empty">No attendance records found.</td>
                      </tr>
                    ) : attendance.map((log, index) => (
                      <tr key={log._id} className={`table-row ${index % 2 !== 0 ? 'table-row-alt' : ''}`}>
                        <td className="px-4 py-2.5 text-navy-100">{fmtDate(log.timestamp)}</td>
                        <td className="px-4 py-2.5 font-mono text-navy-300 tabular">{fmtTime(log.timestamp)}</td>
                        <td className="px-4 py-2.5"><PunchType type={log.type} /></td>
                        <td className="px-4 py-2.5">{log.exceptions?.isLate ? <span className="font-mono text-2xs text-signal-warning font-semibold">LATE</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Panel title="My Requests">
                <div className="divide-y divide-navy-500/40">
                  {corrections.length === 0 ? (
                    <p className="px-4 py-8 text-center text-2xs text-navy-400">No correction requests yet.</p>
                  ) : corrections.slice(0, 8).map((item) => (
                    <div key={item._id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium text-navy-100">{fmtDate(item.targetDate)}</p>
                          <p className="text-2xs text-navy-300 mt-1">{item.notes || item.reasonCode}</p>
                        </div>
                        <Badge variant={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'danger' : 'warning'}>
                          {item.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="My Payslips">
                <div className="divide-y divide-navy-500/40">
                  {payslips.length === 0 ? (
                    <p className="px-4 py-8 text-center text-2xs text-navy-400">No approved payslips yet.</p>
                  ) : payslips.slice(0, 6).map((entry) => (
                    <div key={entry.runId} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-navy-100">{fmtDateRange(entry.cutoffStart, entry.cutoffEnd)}</p>
                        <p className="text-2xs text-navy-300 mt-1">{entry.branchId?.name || 'All branches'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold tabular text-signal-success">{fmtPeso(entry.payslip?.netPay || 0)}</p>
                        <p className="text-2xs text-navy-400 mt-1">{entry.status.replace('_', ' ')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Main page
export default function Dashboard() {
  const { user } = useAuth()
  const [employees,  setEmployees]  = useState([])
  const [todayLogs,  setTodayLogs]  = useState([])
  const [pendingCorr, setPending]   = useState(0)
  const [payrollRuns, setPayroll]   = useState([])
  const [recentLogs,  setRecent]    = useState([])
  const [loading,     setLoading]   = useState(true)

  useEffect(() => {
    if (user?.role === 'employee') return undefined

    Promise.all([
      getEmployees().catch(()               => ({ data: [] })),
      getAttendance({ limit: 200 }).catch(() => ({ data: [] })),
      getCorrections({ status: 'pending' }).catch(() => ({ data: [] })),
      getPayrollRuns().catch(()             => ({ data: [] })),
    ]).then(([empRes, attRes, corrRes, payRes]) => {
      const emps = empRes?.data  || []
      const logs = attRes?.data  || []
      const today = new Date().toDateString()
      setEmployees(emps)
      setTodayLogs(logs.filter(l => new Date(l.timestamp).toDateString() === today))
      setPending((corrRes?.data || []).length)
      setPayroll(payRes?.data   || [])
      setRecent(logs.slice(0, 14))
    }).finally(() => setLoading(false))
  }, [user?.role])

  if (user?.role === 'employee') {
    return <EmployeeDashboard />
  }

  const presentToday = new Set(
    todayLogs.filter(l => l.type === 'IN').map(l =>
      typeof l.employeeId === 'object' ? l.employeeId._id : l.employeeId
    )
  ).size

  // Determine current punch status per employee (latest punch wins)
  const latestPunchByEmployee = {}
  for (const log of todayLogs) {
    const empId = typeof log.employeeId === 'object' ? log.employeeId._id : log.employeeId
    if (!latestPunchByEmployee[empId] || new Date(log.timestamp) > new Date(latestPunchByEmployee[empId].timestamp)) {
      latestPunchByEmployee[empId] = log
    }
  }
  const onBreakToday = Object.values(latestPunchByEmployee).filter(l => l.type === 'BREAK_OUT').length

  const lateToday   = todayLogs.filter(l => l.exceptions?.isLate).length
  const absentToday = Math.max(0, employees.length - presentToday)

  const now = new Date()
  const datestamp = now.toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="label-caps">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-3.5
                      border-b border-navy-500 bg-navy-800">
        <div>
          <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">
            Dashboard
          </h1>
          <p className="text-2xs text-navy-400 mt-0.5 font-mono">{datestamp}</p>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="label-caps mb-0.5">Workforce</p>
            <p className="text-lg font-bold tabular text-navy-50 leading-none">{employees.length}</p>
          </div>
          <div className="w-px h-8 bg-navy-500" />
          <div className="text-right">
            <p className="label-caps mb-0.5">Present</p>
            <p className="text-lg font-bold tabular text-signal-success leading-none">{presentToday}</p>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5 pb-0">
        <KPI label="Total Employees"     value={employees.length}  href="/employees"   accent />
        <KPI label="Present Today"       value={presentToday}      href="/attendance"
             sub={`of ${employees.length} workforce`} />
        <KPI label="Late Today"          value={lateToday}         href="/attendance" />
        <KPI label="Pending Corrections" value={pendingCorr}       href="/corrections" />
      </div>

      {/* Main grid */}
      <div className="flex-1 overflow-auto p-5 pt-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 max-w-[1600px]">

          {/* Recent Attendance log - col-span-7 */}
          <div className="lg:col-span-7">
            <Panel title="Recent Attendance" action="View All" actionHref="/attendance">
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr className="table-head-row">
                      <th className="table-th">Employee</th>
                      <th className="table-th">Time</th>
                      <th className="table-th">Type</th>
                      <th className="table-th">Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="table-empty">
                          No attendance records found.
                        </td>
                      </tr>
                    ) : recentLogs.map((log, i) => (
                      <tr
                        key={log._id}
                        className={`table-row ${i % 2 !== 0 ? 'table-row-alt' : ''}`}
                      >
                        <td className="px-4 py-2.5 font-medium text-navy-100">
                          {employeeName(log.employeeId)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-navy-300 tabular">
                          {fmtTime(log.timestamp)}
                        </td>
                        <td className="px-4 py-2.5">
                          <PunchType type={log.type} />
                        </td>
                        <td className="px-4 py-2.5">
                          {log.exceptions?.isLate && (
                            <span className="font-mono text-2xs text-signal-warning font-semibold">
                              LATE
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          {/* Right column - col-span-5 */}
          <div className="lg:col-span-5 flex flex-col gap-4">

            {/* Today status block */}
            <Panel title="Today's Status">
              <div className="grid grid-cols-4 gap-px bg-navy-500/30 border-t border-navy-500/20">
                {[
                  { label: 'Present',  value: presentToday,  cls: 'text-signal-success' },
                  { label: 'On Break', value: onBreakToday,  cls: 'text-signal-warning' },
                  { label: 'Late',     value: lateToday,     cls: 'text-accent-400' },
                  { label: 'Absent',   value: absentToday,   cls: 'text-navy-200' },
                ].map(item => (
                  <div key={item.label} className="bg-navy-700 py-4 text-center">
                    <p className={`text-2xl font-bold tabular ${item.cls}`}>{item.value}</p>
                    <p className="label-caps mt-1">{item.label}</p>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Payroll register */}
            <Panel title="Payroll Register" action="View All" actionHref="/payroll/runs">
              <div className="divide-y divide-navy-500/40">
                {payrollRuns.length === 0 ? (
                  <p className="px-4 py-8 text-center text-2xs text-navy-400">
                    No payroll runs on record.
                  </p>
                ) : payrollRuns.slice(0, 6).map(run => (
                  <div
                    key={run._id}
                    className="flex items-center justify-between px-4 py-3
                               hover:bg-navy-600/30 transition-colors duration-80"
                  >
                    <div>
                      <p className="text-xs font-medium text-navy-100">
                        {fmtDateRange(run.cutoffStart, run.cutoffEnd)}
                      </p>
                      <p className="text-2xs font-mono text-signal-success mt-0.5 tabular">
                        {fmtPesoShort(run.totalNet)}
                      </p>
                    </div>
                    <Badge variant={run.status}>{run.status?.replace('_', ' ')}</Badge>
                  </div>
                ))}
              </div>
            </Panel>

            <SyncObservabilityPanel branchId={user?.branchId || ''} />

          </div>
        </div>
      </div>
    </div>
  )
}


