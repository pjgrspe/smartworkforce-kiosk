/**
 * Payroll — Salary Structures page.
 */

import { useState, useEffect, useCallback } from 'react'
import { getEmployees, getBranches, getSalaryStructures, getSalaryHistory, createSalary } from '../config/api'
import { useAuth } from '../contexts/AuthContext'

const inputCls = 'field-base text-xs'

const money = new Intl.NumberFormat('en-PH', {
  style: 'currency', currency: 'PHP', minimumFractionDigits: 2,
})
function fmtMoney(value) { return money.format(Number(value || 0)) }
function humanizeFrequency(value) { return String(value || '').replace(/_/g, ' ') }

// ── Salary Modal ──────────────────────────────────────────────────
function SalaryModal({ employees, initialEmployeeId = '', onClose, onDone }) {
  const [employeeId, setEmployeeId] = useState('')
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [form, setForm] = useState({
    salaryType: 'monthly', basicRate: '', paymentFrequency: 'semi_monthly',
    overtimeEligible: true, nightDiffEligible: true,
    leaveCredits: { vacationLeave: 15, sickLeave: 15 }
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => { setEmployeeSearch('') }, [initialEmployeeId])
  useEffect(() => { if (initialEmployeeId) setEmployeeId(initialEmployeeId) }, [initialEmployeeId])

  const normalizedSearch = employeeSearch.trim().toLowerCase()
  const hasSearch = normalizedSearch.length > 0
  const selectedEmployee = employees.find((e) => e._id === employeeId) || null
  const filteredEmployees = employees.filter((e) => {
    if (!hasSearch) return false
    return [e.firstName, e.lastName, e.employeeCode, e.email, e.employment?.position]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(normalizedSearch))
  }).sort((a, b) => {
    const an = `${a.lastName || ''} ${a.firstName || ''}`.trim()
    const bn = `${b.lastName || ''} ${b.firstName || ''}`.trim()
    return an.localeCompare(bn)
  })
  const visibleEmployees = filteredEmployees.slice(0, 80)
  const selectEmployee = (id) => { setEmployeeId(id); setEmployeeSearch(''); setError('') }

  const submit = async () => {
    if (!employeeId || !form.basicRate) { setError('Employee and basic rate are required'); return }
    setSaving(true); setError('')
    try {
      await createSalary({ ...form, employeeId, basicRate: parseFloat(form.basicRate) })
      onDone()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 backdrop-blur-[2px]">
      <div className="bg-navy-700 border border-navy-500 rounded-lg shadow-[0_24px_64px_rgba(3,7,13,0.8)] w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-5 border-b border-navy-500">
          <h3 className="text-sm font-semibold text-navy-50">Set Salary Structure</h3>
          <button onClick={onClose} className="text-navy-400 hover:text-navy-100 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="p-3 bg-signal-danger/8 border border-signal-danger/25 text-signal-danger rounded-md text-2xs">{error}</div>}
          <div>
            <label className="label-caps mb-1 block">Employee *</label>
            <div className="space-y-2.5">
              <div className="rounded-md border border-navy-500/80 bg-navy-600/55 px-3 py-2.5">
                {selectedEmployee ? (
                  <>
                    <p className="label-caps text-accent !tracking-[0.14em]">Selected Employee</p>
                    <p className="mt-1 text-xs font-semibold text-navy-100">{selectedEmployee.firstName} {selectedEmployee.lastName}</p>
                    <p className="mt-1 text-2xs text-navy-300">
                      {selectedEmployee.employeeCode}
                      {selectedEmployee.email ? ` • ${selectedEmployee.email}` : ''}
                      {selectedEmployee.employment?.position ? ` • ${selectedEmployee.employment.position}` : ''}
                    </p>
                  </>
                ) : (
                  <p className="text-2xs text-navy-300">No employee selected yet.</p>
                )}
              </div>
              <div className="relative">
                <input type="text" value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="Type name, code, email, or position..."
                  className={`${inputCls} w-full pr-20`} />
                {employeeSearch && (
                  <button type="button" onClick={() => setEmployeeSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-2xs text-navy-200 hover:bg-navy-500/50">
                    Clear
                  </button>
                )}
                {hasSearch && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-navy-500 bg-navy-700 shadow-[0_18px_40px_rgba(3,7,13,0.55)]">
                    <div className="border-b border-navy-500/70 px-3 py-2 text-2xs text-navy-300">
                      {filteredEmployees.length} match{filteredEmployees.length === 1 ? '' : 'es'}
                      {filteredEmployees.length > visibleEmployees.length ? ` (showing first ${visibleEmployees.length})` : ''}
                    </div>
                    <div className="max-h-52 overflow-y-auto bg-navy-650/60">
                      {filteredEmployees.length === 0 ? (
                        <div className="px-3 py-3 text-2xs text-navy-300">No employees match your search.</div>
                      ) : visibleEmployees.map((e) => {
                        const isSelected = e._id === employeeId
                        return (
                          <button key={e._id} type="button" onClick={() => selectEmployee(e._id)}
                            className={`flex w-full items-start justify-between gap-3 border-b border-navy-500/30 px-3 py-2.5 text-left transition-colors last:border-b-0 ${isSelected ? 'bg-accent/12 text-navy-50' : 'hover:bg-navy-500/35 text-navy-200'}`}>
                            <div>
                              <p className="text-xs font-medium">{e.firstName} {e.lastName}</p>
                              <p className="mt-1 text-2xs text-navy-300">
                                {e.employeeCode}
                                {e.email ? ` • ${e.email}` : ''}
                                {e.employment?.position ? ` • ${e.employment.position}` : ''}
                              </p>
                            </div>
                            {isSelected && <span className="text-2xs font-semibold text-accent">Selected</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {!hasSearch && <p className="text-2xs text-navy-300 mt-1">Start typing to search employees.</p>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-caps mb-1 block">Salary Type</label>
              <select className={inputCls} value={form.salaryType} onChange={e => setForm(p => ({ ...p, salaryType: e.target.value }))}>
                <option value="monthly">Monthly</option>
                <option value="daily">Daily</option>
                <option value="hourly">Hourly</option>
              </select>
            </div>
            <div>
              <label className="label-caps mb-1 block">Basic Rate (PHP) *</label>
              <input type="number" className={inputCls} value={form.basicRate} onChange={e => setForm(p => ({ ...p, basicRate: e.target.value }))} />
            </div>
            <div>
              <label className="label-caps mb-1 block">Pay Frequency</label>
              <select className={inputCls} value={form.paymentFrequency} onChange={e => setForm(p => ({ ...p, paymentFrequency: e.target.value }))}>
                <option value="monthly">Monthly</option>
                <option value="semi_monthly">Semi-Monthly (15th &amp; 30th)</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-xs text-navy-200 cursor-pointer">
              <input type="checkbox" checked={form.overtimeEligible} onChange={e => setForm(p => ({ ...p, overtimeEligible: e.target.checked }))} />
              OT Eligible
            </label>
            <label className="flex items-center gap-2 text-xs text-navy-200 cursor-pointer">
              <input type="checkbox" checked={form.nightDiffEligible} onChange={e => setForm(p => ({ ...p, nightDiffEligible: e.target.checked }))} />
              Night Diff Eligible
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5 border-t border-navy-500/50 pt-3">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-navy-500 text-navy-200 hover:bg-navy-600">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-5 py-2 bg-accent text-white rounded-md hover:bg-accent-400 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Salary Tab ────────────────────────────────────────────────────
function SalaryTab({ employees, branches, currentUser, refreshToken, onOpenNewSalary }) {
  const [activeSalaries, setActiveSalaries] = useState([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [history, setHistory] = useState([])
  const [loadingOverview, setLoadingOverview] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [salaryFilter, setSalaryFilter] = useState('all')
  const canManageBranches = ['super_admin', 'client_admin'].includes(currentUser?.role)
  const userBranchId = currentUser?.branchId?._id || currentUser?.branchId || ''

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true); setError('')
    try {
      const res = await getSalaryStructures()
      setActiveSalaries(res?.data || [])
    } catch (err) { setError(err.message) }
    finally { setLoadingOverview(false) }
  }, [])

  useEffect(() => { loadOverview() }, [loadOverview, refreshToken])

  useEffect(() => {
    if (!selectedEmployeeId) return
    let cancelled = false
    ;(async () => {
      setLoadingHistory(true); setError('')
      try {
        const res = await getSalaryHistory(selectedEmployeeId)
        if (!cancelled) setHistory(res?.data || [])
      } catch (err) {
        if (!cancelled) { setHistory([]); setError(err.message) }
      } finally { if (!cancelled) setLoadingHistory(false) }
    })()
    return () => { cancelled = true }
  }, [selectedEmployeeId, refreshToken])

  const salaryByEmployeeId = new Map(activeSalaries.map((r) => [r.employeeId?._id, r]))
  const branchById = new Map(branches.map((b) => [b._id, b]))
  const rows = employees.map((employee) => ({
    employee,
    salary: salaryByEmployeeId.get(employee._id) || null,
    branchName: branchById.get(employee.branchId?._id || employee.branchId)?.name || 'Unassigned Branch',
  })).filter((row) => {
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || [
      row.employee.firstName, row.employee.lastName, row.employee.employeeCode,
      row.employee.email, row.employee.employment?.position, row.branchName,
    ].filter(Boolean).some((v) => String(v).toLowerCase().includes(query))
    const employeeBranchId = row.employee.branchId?._id || row.employee.branchId || ''
    const matchesBranch = canManageBranches
      ? (branchFilter === 'all' || employeeBranchId === branchFilter)
      : (!userBranchId || employeeBranchId === userBranchId)
    const matchesSalary = salaryFilter === 'all'
      || (salaryFilter === 'configured' && !!row.salary)
      || (salaryFilter === 'missing' && !row.salary)
    return matchesSearch && matchesBranch && matchesSalary
  }).sort((a, b) => {
    if (!!a.salary !== !!b.salary) return a.salary ? -1 : 1
    if (a.branchName !== b.branchName) return a.branchName.localeCompare(b.branchName)
    return `${a.employee.lastName || ''} ${a.employee.firstName || ''}`.localeCompare(`${b.employee.lastName || ''} ${b.employee.firstName || ''}`)
  })

  useEffect(() => {
    if (!rows.length) { if (selectedEmployeeId) setSelectedEmployeeId(''); return }
    if (!selectedEmployeeId || !rows.some((r) => r.employee._id === selectedEmployeeId)) {
      setSelectedEmployeeId(rows[0].employee._id)
    }
  }, [rows, selectedEmployeeId])

  const configuredRows = rows.filter((r) => r.salary)
  const missingRows = rows.filter((r) => !r.salary)
  const selectedRow = rows.find((r) => r.employee._id === selectedEmployeeId) || null
  const selectedEmployee = selectedRow?.employee || null
  const selectedSalary = selectedRow?.salary || null
  const employeesWithSalary = employees.filter((e) => salaryByEmployeeId.has(e._id)).length

  return (
    <div className="grid grid-cols-12 gap-6 min-h-full">
      <aside className="col-span-12 xl:col-span-4 table-shell overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-navy-500 px-5 py-4 bg-navy-800/70">
          <div>
            <p className="label-caps">Salary Coverage</p>
            <p className="mt-1 text-sm font-semibold text-navy-100">{employeesWithSalary} of {employees.length} employees configured</p>
          </div>
          <button onClick={onOpenNewSalary} className="px-3 py-1.5 bg-accent text-white rounded-md hover:bg-accent-400 text-xs font-medium">
            + Set Salary
          </button>
        </div>
        <div className="border-b border-navy-500/50 bg-navy-700/40 px-5 py-4 space-y-3">
          <div>
            <p className="label-caps mb-1">Search</p>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee, code, role, or branch..."
              className="field-base w-full text-xs" />
          </div>
          <div className={`grid gap-3 ${canManageBranches ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {canManageBranches && (
              <div>
                <p className="label-caps mb-1">Branch</p>
                <select className="field-base text-xs" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                  <option value="all">All branches</option>
                  {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <p className="label-caps mb-1">Salary</p>
              <select className="field-base text-xs" value={salaryFilter} onChange={(e) => setSalaryFilter(e.target.value)}>
                <option value="all">All employees</option>
                <option value="configured">Configured only</option>
                <option value="missing">Missing only</option>
              </select>
            </div>
          </div>
          {!canManageBranches && <p className="text-2xs text-navy-300">Branch scope is locked to your assigned branch.</p>}
          <p className="text-2xs text-navy-300">Showing {rows.length} employees after filters</p>
        </div>
        {loadingOverview ? (
          <div className="table-empty">Loading salary structures...</div>
        ) : rows.length === 0 ? (
          <div className="table-empty">No employees available.</div>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            {[{ label: 'Configured', rows: configuredRows }, { label: 'Missing Salary', rows: missingRows }]
              .filter((s) => s.rows.length > 0).map((section) => (
                <div key={section.label} className="border-b border-navy-500/20 last:border-b-0">
                  <div className="sticky top-0 z-10 border-y border-navy-500/20 bg-navy-800/90 px-5 py-2.5 backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="label-caps">{section.label}</p>
                      <span className="text-2xs text-navy-300">{section.rows.length}</span>
                    </div>
                  </div>
                  {section.rows.map(({ employee, salary, branchName }) => {
                    const active = employee._id === selectedEmployeeId
                    return (
                      <button key={employee._id} type="button" onClick={() => setSelectedEmployeeId(employee._id)}
                        className={`w-full border-b border-navy-500/20 px-5 py-4 text-left transition-colors duration-80 ${active ? 'bg-navy-600/55' : 'hover:bg-navy-700/35'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-navy-100">{employee.firstName} {employee.lastName}</p>
                            <p className="mt-1 text-2xs text-navy-300">{employee.employeeCode} • {employee.employment?.position || 'Unassigned role'}</p>
                            <p className="mt-1 text-2xs text-navy-400">{branchName}</p>
                          </div>
                          <span className={`rounded-md border px-2 py-0.5 text-2xs font-medium ${salary ? 'border-signal-success/25 bg-signal-success/10 text-signal-success' : 'border-signal-warning/25 bg-signal-warning/10 text-signal-warning'}`}>
                            {salary ? 'Configured' : 'Missing'}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-2xs">
                          <div>
                            <p className="label-caps">Rate</p>
                            <p className="mt-1 text-navy-200">{salary ? fmtMoney(salary.basicRate) : '—'}</p>
                          </div>
                          <div className="text-right">
                            <p className="label-caps">Frequency</p>
                            <p className="mt-1 text-navy-200">{salary ? humanizeFrequency(salary.paymentFrequency) : '—'}</p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))}
          </div>
        )}
      </aside>

      <section className="col-span-12 xl:col-span-8 space-y-4 min-w-0">
        {error && (
          <div className="rounded-lg border border-signal-danger/25 bg-signal-danger/8 px-4 py-3 text-xs text-signal-danger">{error}</div>
        )}
        {!selectedEmployee ? (
          <div className="table-shell p-6 text-sm text-navy-300">Select an employee to view salary details.</div>
        ) : (
          <>
            <div className="table-shell p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="label-caps">Selected Employee</p>
                  <p className="mt-1 text-lg font-semibold text-navy-50">{selectedEmployee.firstName} {selectedEmployee.lastName}</p>
                  <p className="mt-1 text-xs text-navy-300">{selectedEmployee.employeeCode} • {selectedEmployee.employment?.position || 'Unassigned role'}</p>
                </div>
                <button onClick={() => onOpenNewSalary(selectedEmployee._id)}
                  className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-400 text-xs font-medium">
                  {selectedSalary ? 'Update Salary Structure' : 'Set Salary Structure'}
                </button>
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-md border border-navy-500 bg-navy-600 px-4 py-3">
                  <p className="label-caps">Current Rate</p>
                  <p className="mt-1 text-base font-bold text-navy-50">{selectedSalary ? fmtMoney(selectedSalary.basicRate) : 'No active salary'}</p>
                </div>
                <div className="rounded-md border border-navy-500 bg-navy-600 px-4 py-3">
                  <p className="label-caps">Salary Type</p>
                  <p className="mt-1 text-base font-bold text-navy-50">{selectedSalary ? selectedSalary.salaryType : '—'}</p>
                </div>
                <div className="rounded-md border border-navy-500 bg-navy-600 px-4 py-3">
                  <p className="label-caps">Pay Frequency</p>
                  <p className="mt-1 text-base font-bold text-navy-50">{selectedSalary ? humanizeFrequency(selectedSalary.paymentFrequency) : '—'}</p>
                </div>
              </div>
            </div>
            <div className="table-shell overflow-hidden">
              <div className="border-b border-navy-500 bg-navy-800/60 px-5 py-4">
                <p className="label-caps">Salary History</p>
                <p className="mt-1 text-sm font-semibold text-navy-100">{history.length} record{history.length === 1 ? '' : 's'}</p>
              </div>
              {loadingHistory ? (
                <div className="table-empty">Loading salary history...</div>
              ) : history.length === 0 ? (
                <div className="table-empty">No salary structure recorded for this employee yet.</div>
              ) : (
                <table className="table-base">
                  <thead className="table-head-row">
                    <tr>
                      {['Effective', 'Rate', 'Type', 'Frequency', 'Status', 'OT', 'ND'].map((h) => (
                        <th key={h} className="table-th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((record) => (
                      <tr key={record._id} className="table-row">
                        <td className="px-4 py-2.5 text-navy-200">{new Date(record.effectiveDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                        <td className="px-4 py-2.5 font-medium text-navy-100">{fmtMoney(record.basicRate)}</td>
                        <td className="px-4 py-2.5 text-navy-200 capitalize">{record.salaryType}</td>
                        <td className="px-4 py-2.5 text-navy-200 capitalize">{humanizeFrequency(record.paymentFrequency)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-md border px-2 py-0.5 text-2xs font-medium ${record.isActive ? 'border-signal-success/25 bg-signal-success/10 text-signal-success' : 'border-navy-500 bg-navy-700/70 text-navy-300'}`}>
                            {record.isActive ? 'Active' : 'Archived'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-navy-200">{record.overtimeEligible ? 'Eligible' : 'Off'}</td>
                        <td className="px-4 py-2.5 text-navy-200">{record.nightDiffEligible ? 'Eligible' : 'Off'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────
export default function PayrollSalary() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState([])
  const [branches,  setBranches]  = useState([])
  const [showNewSalary, setShowNewSalary] = useState(false)
  const [salaryModalEmployeeId, setSalaryModalEmployeeId] = useState('')
  const [salaryRefreshKey, setSalaryRefreshKey] = useState(0)

  useEffect(() => {
    Promise.all([getEmployees(), getBranches()])
      .then(([empRes, branchRes]) => {
        setEmployees(empRes?.data || [])
        setBranches(branchRes?.data || [])
      })
      .catch(() => {})
  }, [])

  const canManageBranches = ['super_admin', 'client_admin'].includes(user?.role)
  const userBranchId = user?.branchId?._id || user?.branchId || ''
  const scopedEmployees = !canManageBranches && userBranchId
    ? employees.filter((e) => (e.branchId?._id || e.branchId || '') === userBranchId)
    : employees

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-navy-500 bg-navy-800">
        <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">Salary Structures</h1>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <SalaryTab
          employees={scopedEmployees}
          branches={branches}
          currentUser={user}
          refreshToken={salaryRefreshKey}
          onOpenNewSalary={(employeeId = '') => {
            setSalaryModalEmployeeId(employeeId)
            setShowNewSalary(true)
          }}
        />
        {showNewSalary && (
          <SalaryModal
            employees={scopedEmployees}
            initialEmployeeId={salaryModalEmployeeId}
            onClose={() => { setShowNewSalary(false); setSalaryModalEmployeeId('') }}
            onDone={() => { setShowNewSalary(false); setSalaryModalEmployeeId(''); setSalaryRefreshKey((v) => v + 1) }}
          />
        )}
      </div>
    </div>
  )
}
