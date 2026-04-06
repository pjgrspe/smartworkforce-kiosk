/**
 * Payroll — Holidays page. Holidays can be company-wide or branch-specific.
 */

import { useState, useEffect, useCallback } from 'react'
import { getHolidays, createHoliday, deleteHoliday, bulkHolidays, getBranches, getTenantSettings } from '../config/api'

// ── PH holiday template (names + types only, no dates) ────────────
const PH_HOLIDAY_TEMPLATE = [
  { name: "New Year's Day",                     type: 'regular' },
  { name: 'Araw ng Kagitingan',                 type: 'regular' },
  { name: 'Maundy Thursday',                    type: 'regular' },
  { name: 'Good Friday',                        type: 'regular' },
  { name: "Eid'l Fitr",                         type: 'regular' },
  { name: 'Labor Day',                          type: 'regular' },
  { name: 'Independence Day',                   type: 'regular' },
  { name: "Eid'l Adha",                         type: 'regular' },
  { name: 'National Heroes Day',                type: 'regular' },
  { name: 'Bonifacio Day',                      type: 'regular' },
  { name: 'Christmas Day',                      type: 'regular' },
  { name: 'Rizal Day',                          type: 'regular' },
  { name: 'People Power Revolution',            type: 'special_non_working' },
  { name: 'Black Saturday',                     type: 'special_non_working' },
  { name: 'Ninoy Aquino Day',                   type: 'special_non_working' },
  { name: 'All Saints Day',                     type: 'special_non_working' },
  { name: 'All Souls Day',                      type: 'special_non_working' },
  { name: 'Feast of the Immaculate Conception', type: 'special_non_working' },
  { name: 'Christmas Eve',                      type: 'special_non_working' },
  { name: "New Year's Eve",                     type: 'special_non_working' },
]

const fieldCls = `h-8 px-3 text-xs bg-navy-700 border border-navy-500 text-navy-100
  placeholder:text-navy-400 focus:outline-none focus:border-accent rounded-md`

export default function PayrollHolidays() {
  const currentYear = new Date().getFullYear()
  const [year,         setYear]         = useState(currentYear)
  const [filterBranch, setFilterBranch] = useState('all')   // for the list only
  const [branches,     setBranches]     = useState([])
  const [holidays,     setHolidays]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [form,         setForm]         = useState({ name: '', date: '', type: 'regular', branchId: 'none', payMultiplier: '' })
  const [saving,       setSaving]       = useState(false)
  const [msg,          setMsg]          = useState('')
  const [showTemplate, setShowTemplate] = useState(false)
  const [template,     setTemplate]     = useState([])
  const [tmplBranch,   setTmplBranch]   = useState('none')  // branch for the bulk template
  const [bulkSaving,   setBulkSaving]   = useState(false)
  const [bulkMsg,      setBulkMsg]      = useState('')
  const [otMultipliers, setOtMultipliers] = useState({})

  useEffect(() => {
    getBranches().then(res => setBranches(res?.data || [])).catch(() => {})
    getTenantSettings().then(res => setOtMultipliers(res?.data?.settings?.overtimeMultipliers || {})).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Always load all holidays for the year; filter client-side for the list view
      const res = await getHolidays({ year })
      setHolidays(res?.data || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [year])

  useEffect(() => { load() }, [load])

  const openTemplate = () => {
    setTemplate(PH_HOLIDAY_TEMPLATE.map(h => ({ ...h, date: '' })))
    setTmplBranch('none')
    setBulkMsg('')
    setShowTemplate(true)
  }

  const saveTemplate = async () => {
    const filled = template.filter(h => h.date.trim() !== '')
    if (!filled.length) { setBulkMsg('Fill in at least one date before saving.'); return }
    setBulkSaving(true); setBulkMsg('')
    try {
      await bulkHolidays(filled, tmplBranch === 'none' ? null : tmplBranch)
      load()
      setShowTemplate(false)
    } catch (err) { setBulkMsg(err.message) }
    finally { setBulkSaving(false) }
  }

  const addHoliday = async () => {
    if (!form.name || !form.date) { setMsg('Name and date required'); return }
    setSaving(true); setMsg('')
    try {
      const payMultiplier = form.payMultiplier !== '' ? Number(form.payMultiplier) : null
      await createHoliday({ name: form.name, date: form.date, type: form.type, branchId: form.branchId === 'none' ? null : form.branchId, payMultiplier })
      setForm(f => ({ ...f, name: '', date: '' }))
      load()
    } catch (err) { setMsg(err.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    await deleteHoliday(id); load()
  }

  // Client-side filter for the list
  const visibleHolidays = filterBranch === 'all'
    ? holidays
    : filterBranch === 'none'
      ? holidays.filter(h => !h.branchId)
      : holidays.filter(h => h.branchId === filterBranch)

  const regularRows = template.filter(h => h.type === 'regular')
  const specialRows = template.filter(h => h.type === 'special_non_working')
  const tmplBranchLabel = tmplBranch === 'none' ? 'Company-wide' : (branches.find(b => b._id === tmplBranch)?.name || '')

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-navy-500 bg-navy-800">
        <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">Holidays</h1>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Add single holiday */}
        <div className="bg-navy-700 border border-navy-500 rounded-lg p-4">
          <h4 className="label-caps mb-3">Add Holiday</h4>
          <div className="flex gap-3 flex-wrap items-end">
            <div className="flex flex-col gap-1">
              <label className="label-caps">Name</label>
              <input className={`${fieldCls} w-48`} value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Holiday name" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="label-caps">Date</label>
              <input type="date" className={`${fieldCls} w-36`} value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="label-caps">Type</label>
              <select className={`${fieldCls} w-44`} value={form.type}
                onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                <option value="regular">Regular Holiday</option>
                <option value="special_non_working">Special Non-Working</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="label-caps">Applies To</label>
              <select className={`${fieldCls} w-44`} value={form.branchId}
                onChange={e => setForm(p => ({ ...p, branchId: e.target.value }))}>
                <option value="none">All branches (company-wide)</option>
                {branches.map(b => <option key={b._id} value={b._id}>{b.name} only</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="label-caps">Pay Rate</label>
              <input type="number" step="0.01" min="1" className={`${fieldCls} w-24`}
                value={form.payMultiplier} placeholder="e.g. 1.30"
                onChange={e => setForm(p => ({ ...p, payMultiplier: e.target.value }))} />
            </div>
            <button onClick={addHoliday} disabled={saving}
              className="h-8 px-4 bg-accent text-white rounded-md hover:bg-accent-400 text-xs disabled:opacity-50">
              {saving ? 'Adding...' : 'Add'}
            </button>
            {msg && <span className="text-xs text-signal-danger self-end">{msg}</span>}
          </div>
        </div>

        {/* Template panel */}
        {showTemplate && (
          <div className="bg-navy-700 border border-navy-500 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-navy-500 bg-navy-800/60">
              <div>
                <p className="text-xs font-semibold text-navy-100 uppercase tracking-wider">PH {year} Holiday Template</p>
                <p className="text-2xs text-navy-400 mt-0.5">
                  Enter confirmed dates from the official Malacañang proclamation. Leave blank to skip.
                </p>
              </div>
              <button onClick={() => setShowTemplate(false)} className="text-navy-400 hover:text-navy-100 text-xl leading-none ml-4">×</button>
            </div>

            <div className="p-5 space-y-5">
              {/* Branch selector inside template */}
              <div className="flex items-center gap-3">
                <label className="label-caps shrink-0">Applies To</label>
                <select className={`${fieldCls} w-52`} value={tmplBranch} onChange={e => setTmplBranch(e.target.value)}>
                  <option value="none">All branches (company-wide)</option>
                  {branches.map(b => <option key={b._id} value={b._id}>{b.name} only</option>)}
                </select>
              </div>

              {[
                { label: 'Regular Holidays',         rows: regularRows, color: 'text-signal-danger',  bg: 'bg-signal-danger/10 border-signal-danger/25' },
                { label: 'Special Non-Working Days', rows: specialRows, color: 'text-signal-warning', bg: 'bg-signal-warning/10 border-signal-warning/25' },
              ].map(({ label, rows, color, bg }) => (
                <div key={label}>
                  <p className="label-caps mb-2">{label}</p>
                  <div className="space-y-2">
                    {rows.map(h => {
                      const globalIdx = template.findIndex(t => t.name === h.name)
                      return (
                        <div key={h.name} className="flex items-center gap-3">
                          <span className={`w-48 shrink-0 text-xs font-medium px-2 py-1 rounded border ${bg} ${color}`}>{h.name}</span>
                          <input
                            type="date"
                            className={`${fieldCls} w-36`}
                            value={template[globalIdx]?.date || ''}
                            onChange={e => setTemplate(prev => prev.map((item, idx) =>
                              idx === globalIdx ? { ...item, date: e.target.value } : item
                            ))}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              {bulkMsg && <p className="text-xs text-signal-danger">{bulkMsg}</p>}

              <div className="flex items-center gap-3 pt-2 border-t border-navy-500/50">
                <button onClick={saveTemplate} disabled={bulkSaving}
                  className="px-5 py-2 bg-accent text-white rounded-md hover:bg-accent-400 disabled:opacity-50 text-xs font-medium">
                  {bulkSaving ? 'Saving...' : `Save ${template.filter(h => h.date).length} holidays — ${tmplBranchLabel}`}
                </button>
                <button onClick={() => setShowTemplate(false)} className="px-4 py-2 text-xs text-navy-300 hover:text-navy-100">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* List controls */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="label-caps">Year</label>
            <input type="number" className={`${fieldCls} w-24`}
              value={year} onChange={e => setYear(+e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <label className="label-caps">Show</label>
            <select className={`${fieldCls} w-44`} value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
              <option value="all">All holidays</option>
              <option value="none">Company-wide only</option>
              {branches.map(b => <option key={b._id} value={b._id}>{b.name} only</option>)}
            </select>
          </div>
          <button onClick={openTemplate}
            className="h-8 px-3 text-xs bg-navy-600 border border-navy-500 text-navy-100 rounded-md hover:bg-navy-500 transition-colors whitespace-nowrap">
            Load PH {year} Template
          </button>
        </div>

        {/* Holiday list */}
        {loading ? (
          <div className="text-center py-8 text-navy-400 text-xs">Loading...</div>
        ) : (
          <div className="table-shell">
            <table className="table-base">
              <thead>
                <tr className="table-head-row">
                  <th className="table-th">Date</th>
                  <th className="table-th">Name</th>
                  <th className="table-th">Type</th>
                  <th className="table-th">Pay Rate</th>
                  <th className="table-th">Applies To</th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {visibleHolidays.length === 0 ? (
                  <tr><td colSpan={5} className="table-empty">No holidays found</td></tr>
                ) : visibleHolidays.map((h, i) => {
                  const branch = branches.find(b => b._id === h.branchId)
                  return (
                    <tr key={h._id} className={`table-row ${i % 2 !== 0 ? 'table-row-alt' : ''}`}>
                      <td className="px-4 py-2.5 font-mono text-navy-300 whitespace-nowrap">
                        {new Date(h.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', weekday: 'short' })}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-navy-100">{h.name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-md text-2xs font-medium ${h.type === 'regular' ? 'bg-signal-danger/12 text-signal-danger border border-signal-danger/25' : 'bg-signal-warning/12 text-signal-warning border border-signal-warning/25'}`}>
                          {h.type === 'regular' ? 'Regular' : 'Special'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-2xs font-mono">
                        {h.payMultiplier != null
                          ? <span className="text-navy-100">{Number(h.payMultiplier).toFixed(2)}×</span>
                          : (() => {
                              const effective = h.type === 'regular'
                                ? (otMultipliers.regularHoliday ?? 2.00)
                                : (otMultipliers.specialHoliday ?? 1.30)
                              return <span className="text-navy-400">{Number(effective).toFixed(2)}× <span className="text-navy-600">(default)</span></span>
                            })()
                        }
                      </td>
                      <td className="px-4 py-2.5 text-2xs text-navy-400">
                        {h.branchId ? (branch?.name || '—') : 'All branches'}
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => handleDelete(h._id)} className="text-signal-danger/80 hover:text-signal-danger text-2xs">Delete</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  )
}
