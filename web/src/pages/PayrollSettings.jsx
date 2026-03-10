/**
 * Payroll Settings Page — Salary Structures, Holidays, Company Settings tabs.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  getEmployees, getSalaryHistory, createSalary,
  getHolidays, createHoliday, deleteHoliday, bulkHolidays,
  getTenantSettings, updateTenantSettings
} from '../config/api'

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none'

// ── PH 2025 holidays seed data ────────────────────────────────────
const PH_2025_HOLIDAYS = [
  { name: "New Year's Day",              date: '2025-01-01', type: 'regular' },
  { name: 'People Power Revolution',     date: '2025-02-25', type: 'special_non_working' },
  { name: 'Araw ng Kagitingan',          date: '2025-04-09', type: 'regular' },
  { name: 'Maundy Thursday',             date: '2025-04-17', type: 'regular' },
  { name: 'Good Friday',                 date: '2025-04-18', type: 'regular' },
  { name: 'Black Saturday',             date: '2025-04-19', type: 'special_non_working' },
  { name: 'Labor Day',                   date: '2025-05-01', type: 'regular' },
  { name: 'Independence Day',            date: '2025-06-12', type: 'regular' },
  { name: 'Ninoy Aquino Day',            date: '2025-08-21', type: 'special_non_working' },
  { name: 'National Heroes Day',         date: '2025-08-25', type: 'regular' },
  { name: 'All Saints Day',              date: '2025-11-01', type: 'special_non_working' },
  { name: 'All Souls Day',               date: '2025-11-02', type: 'special_non_working' },
  { name: 'Bonifacio Day',               date: '2025-11-30', type: 'regular' },
  { name: 'Feast of the Immaculate Conception', date: '2025-12-08', type: 'special_non_working' },
  { name: 'Christmas Eve',               date: '2025-12-24', type: 'special_non_working' },
  { name: 'Christmas Day',               date: '2025-12-25', type: 'regular' },
  { name: 'Rizal Day',                   date: '2025-12-30', type: 'regular' },
  { name: "New Year's Eve",              date: '2025-12-31', type: 'special_non_working' },
]

function SalaryModal({ employees, onClose, onDone }) {
  const [employeeId, setEmployeeId] = useState('')
  const [form, setForm] = useState({
    salaryType: 'monthly', basicRate: '', paymentFrequency: 'semi_monthly',
    overtimeEligible: true, nightDiffEligible: true,
    leaveCredits: { vacationLeave: 15, sickLeave: 15 }
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">Set Salary Structure</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Employee *</label>
            <select className={inputCls} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e._id} value={e._id}>{e.firstName} {e.lastName} ({e.employeeCode})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Salary Type</label>
              <select className={inputCls} value={form.salaryType} onChange={e => setForm(p => ({ ...p, salaryType: e.target.value }))}>
                <option value="monthly">Monthly</option>
                <option value="daily">Daily</option>
                <option value="hourly">Hourly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Basic Rate (₱) *</label>
              <input type="number" className={inputCls} value={form.basicRate} onChange={e => setForm(p => ({ ...p, basicRate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Pay Frequency</label>
              <select className={inputCls} value={form.paymentFrequency} onChange={e => setForm(p => ({ ...p, paymentFrequency: e.target.value }))}>
                <option value="monthly">Monthly</option>
                <option value="semi_monthly">Semi-Monthly (15th & 30th)</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.overtimeEligible}   onChange={e => setForm(p => ({ ...p, overtimeEligible: e.target.checked }))} />
              OT Eligible
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.nightDiffEligible}  onChange={e => setForm(p => ({ ...p, nightDiffEligible: e.target.checked }))} />
              Night Diff Eligible
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Holidays Tab ──────────────────────────────────────────────────
function HolidaysTab() {
  const currentYear = new Date().getFullYear()
  const [year,     setYear]     = useState(currentYear)
  const [holidays, setHolidays] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [seeding,  setSeeding]  = useState(false)
  const [form,     setForm]     = useState({ name: '', date: '', type: 'regular' })
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getHolidays({ year })
      setHolidays(res?.data || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [year])

  useEffect(() => { load() }, [load])

  const addHoliday = async () => {
    if (!form.name || !form.date) { setMsg('Name and date required'); return }
    setSaving(true); setMsg('')
    try {
      await createHoliday(form)
      setForm({ name: '', date: '', type: 'regular' })
      load()
    } catch (err) { setMsg(err.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    await deleteHoliday(id); load()
  }

  const seedPH2025 = async () => {
    if (!window.confirm('This will add PH 2025 holidays. Continue?')) return
    setSeeding(true)
    try {
      await bulkHolidays(PH_2025_HOLIDAYS)
      setYear(2025)
      load()
    } catch (err) { setMsg(err.message) }
    finally { setSeeding(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">Year:</label>
          <input type="number" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24"
            value={year} onChange={e => setYear(+e.target.value)} />
        </div>
        <button onClick={seedPH2025} disabled={seeding}
          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
          {seeding ? 'Seeding…' : '🇵🇭 Seed PH 2025 Holidays'}
        </button>
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>

      {/* Add holiday form */}
      <div className="bg-gray-50 rounded-xl p-4">
        <h4 className="font-medium text-gray-700 mb-3 text-sm">Add Holiday</h4>
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Holiday name" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              <option value="regular">Regular Holiday</option>
              <option value="special_non_working">Special Non-Working</option>
            </select>
          </div>
          <button onClick={addHoliday} disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50">
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Date', 'Name', 'Type', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {holidays.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No holidays for {year}</td></tr>
              ) : holidays.map(h => (
                <tr key={h._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{new Date(h.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', weekday: 'short' })}</td>
                  <td className="px-4 py-3 font-medium">{h.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${h.type === 'regular' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                      {h.type === 'regular' ? 'Regular' : 'Special'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(h._id)} className="text-red-500 hover:underline text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Company Settings Tab ──────────────────────────────────────────
function CompanySettingsTab() {
  const [settings, setSettings] = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState('')

  useEffect(() => {
    getTenantSettings().then(res => setSettings(res?.data)).catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true); setMsg('')
    try {
      await updateTenantSettings({ settings: settings.settings })
      setMsg('✅ Settings saved')
    } catch (err) { setMsg('❌ ' + err.message) }
    finally { setSaving(false) }
  }

  const setOt = (key, val) => setSettings(prev => ({
    ...prev,
    settings: {
      ...prev.settings,
      overtimeMultipliers: { ...prev.settings.overtimeMultipliers, [key]: parseFloat(val) }
    }
  }))

  const setNd = (key, val) => setSettings(prev => ({
    ...prev,
    settings: { ...prev.settings, nightDiffWindow: { ...prev.settings.nightDiffWindow, [key]: val } }
  }))

  if (!settings) return <div className="text-center py-8 text-gray-400">Loading settings…</div>

  const s = settings.settings || {}
  const ot = s.overtimeMultipliers || {}
  const nd = s.nightDiffWindow     || {}

  return (
    <div className="space-y-6 max-w-2xl">
      {msg && <div className="p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded text-sm">{msg}</div>}

      <div className="bg-white rounded-xl border p-5">
        <h4 className="font-semibold text-gray-700 mb-4">General</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Grace Period (min)</label>
            <input type="number" className={inputCls} value={s.gracePeriodMinutes ?? 5}
              onChange={e => setSettings(p => ({ ...p, settings: { ...p.settings, gracePeriodMinutes: +e.target.value } }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rounding Rule (min, 0 = none)</label>
            <input type="number" className={inputCls} value={s.roundingRuleMinutes ?? 0}
              onChange={e => setSettings(p => ({ ...p, settings: { ...p.settings, roundingRuleMinutes: +e.target.value } }))} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5">
        <h4 className="font-semibold text-gray-700 mb-4">OT Multipliers (DOLE defaults)</h4>
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'regular',        label: 'Regular OT'       },
            { key: 'restDay',        label: 'Rest Day OT'      },
            { key: 'specialHoliday', label: 'Special Holiday OT'},
            { key: 'regularHoliday', label: 'Regular Holiday OT'},
            { key: 'nightDiff',      label: 'Night Diff Rate (additive)' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input type="number" step="0.01" className={inputCls} value={ot[key] ?? ''}
                onChange={e => setOt(key, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5">
        <h4 className="font-semibold text-gray-700 mb-4">Night Differential Window</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
            <input type="time" className={inputCls} value={nd.start || '22:00'} onChange={e => setNd('start', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">End Time</label>
            <input type="time" className={inputCls} value={nd.end || '06:00'} onChange={e => setNd('end', e.target.value)} />
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function PayrollSettings() {
  const [tab,       setTab]       = useState('salary')
  const [employees, setEmployees] = useState([])
  const [showNewSalary, setShowNewSalary] = useState(false)

  useEffect(() => {
    getEmployees().then(res => setEmployees(res?.data || [])).catch(() => {})
  }, [])

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Payroll Settings</h2>

      <div className="flex gap-2 mb-6">
        {[['salary', 'Salary Structures'], ['holidays', 'Holidays'], ['company', 'Company Settings']].map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'salary' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowNewSalary(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              + Set Salary
            </button>
          </div>
          <div className="bg-white rounded-xl border p-6">
            <p className="text-gray-500 text-sm text-center">Select an employee to view or set their salary structure.</p>
          </div>
          {showNewSalary && (
            <SalaryModal
              employees={employees}
              onClose={() => setShowNewSalary(false)}
              onDone={() => setShowNewSalary(false)}
            />
          )}
        </div>
      )}

      {tab === 'holidays' && <HolidaysTab />}

      {tab === 'company' && <CompanySettingsTab />}
    </div>
  )
}
