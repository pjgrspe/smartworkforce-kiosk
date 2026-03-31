/**
 * Payroll — Holidays page.
 */

import { useState, useEffect, useCallback } from 'react'
import { getHolidays, createHoliday, deleteHoliday, bulkHolidays } from '../config/api'

// ── PH holiday template (names + types only, no dates) ────────────
// Admin fills in confirmed dates from the official Malacañang proclamation.
const PH_HOLIDAY_TEMPLATE = [
  // ── Regular holidays (Republic Act 9492) ──
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
  // ── Special non-working days (typically proclaimed each year) ──
  { name: 'People Power Revolution',            type: 'special_non_working' },
  { name: 'Black Saturday',                     type: 'special_non_working' },
  { name: 'Ninoy Aquino Day',                   type: 'special_non_working' },
  { name: 'All Saints Day',                     type: 'special_non_working' },
  { name: 'All Souls Day',                      type: 'special_non_working' },
  { name: 'Feast of the Immaculate Conception', type: 'special_non_working' },
  { name: 'Christmas Eve',                      type: 'special_non_working' },
  { name: "New Year's Eve",                     type: 'special_non_working' },
]

// ── Page ──────────────────────────────────────────────────────────
export default function PayrollHolidays() {
  const currentYear = new Date().getFullYear()
  const [year,        setYear]        = useState(currentYear)
  const [holidays,    setHolidays]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [form,        setForm]        = useState({ name: '', date: '', type: 'regular' })
  const [saving,      setSaving]      = useState(false)
  const [msg,         setMsg]         = useState('')
  const [showTemplate, setShowTemplate] = useState(false)
  const [template,    setTemplate]    = useState([]) // working copy with dates filled in
  const [bulkSaving,  setBulkSaving]  = useState(false)
  const [bulkMsg,     setBulkMsg]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getHolidays({ year })
      setHolidays(res?.data || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [year])

  useEffect(() => { load() }, [load])

  const openTemplate = () => {
    setTemplate(PH_HOLIDAY_TEMPLATE.map(h => ({ ...h, date: '' })))
    setBulkMsg('')
    setShowTemplate(true)
  }

  const saveTemplate = async () => {
    const filled = template.filter(h => h.date.trim() !== '')
    if (!filled.length) { setBulkMsg('Fill in at least one date before saving.'); return }
    setBulkSaving(true); setBulkMsg('')
    try {
      await bulkHolidays(filled)
      load()
      setShowTemplate(false)
      setBulkMsg('')
    } catch (err) { setBulkMsg(err.message) }
    finally { setBulkSaving(false) }
  }

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

  const regularRows  = template.filter(h => h.type === 'regular')
  const specialRows  = template.filter(h => h.type === 'special_non_working')

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-navy-500 bg-navy-800">
        <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">Holidays</h1>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Year + template button */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="label-caps">Year</label>
            <input type="number" className="field-base h-8 w-24 text-xs"
              value={year} onChange={e => setYear(+e.target.value)} />
          </div>
          <button onClick={openTemplate}
            className="px-3 py-1.5 text-xs bg-navy-600 border border-navy-500 text-navy-100 rounded-md hover:bg-navy-500 transition-colors">
            Load PH {year} Template
          </button>
          <p className="text-2xs text-navy-400">Fill in dates from the official Malacañang proclamation</p>
        </div>

        {/* Template panel */}
        {showTemplate && (
          <div className="bg-navy-700 border border-navy-500 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-navy-500 bg-navy-800/60">
              <div>
                <p className="text-xs font-semibold text-navy-100 uppercase tracking-wider">PH {year} Holiday Template</p>
                <p className="text-2xs text-navy-400 mt-0.5">
                  Enter confirmed dates from the official proclamation. Leave blank to skip. Eid'l Fitr and Eid'l Adha dates must come from the official announcement.
                </p>
              </div>
              <button onClick={() => setShowTemplate(false)} className="text-navy-400 hover:text-navy-100 text-xl leading-none ml-4">×</button>
            </div>

            <div className="p-5 space-y-5">
              {[
                { label: 'Regular Holidays', rows: regularRows, color: 'text-signal-danger', bg: 'bg-signal-danger/10 border-signal-danger/25' },
                { label: 'Special Non-Working Days', rows: specialRows, color: 'text-signal-warning', bg: 'bg-signal-warning/10 border-signal-warning/25' },
              ].map(({ label, rows, color, bg }) => (
                <div key={label}>
                  <p className="label-caps mb-2">{label}</p>
                  <div className="space-y-2">
                    {rows.map((h, i) => {
                      const globalIdx = template.findIndex(t => t.name === h.name)
                      return (
                        <div key={h.name} className="flex items-center gap-3">
                          <span className={`w-48 shrink-0 text-xs font-medium px-2 py-1 rounded border ${bg} ${color}`}>{h.name}</span>
                          <input
                            type="date"
                            className="field-base text-xs h-8"
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
                  {bulkSaving ? 'Saving...' : `Save ${template.filter(h => h.date).length} filled holidays`}
                </button>
                <button onClick={() => setShowTemplate(false)} className="px-4 py-2 text-xs text-navy-300 hover:text-navy-100">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add single holiday */}
        <div className="bg-navy-700 border border-navy-500 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-navy-100 mb-3 uppercase tracking-wider">Add Holiday</h4>
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="label-caps mb-1 block">Name</label>
              <input className="field-base text-xs" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Holiday name" />
            </div>
            <div>
              <label className="label-caps mb-1 block">Date</label>
              <input type="date" className="field-base text-xs" value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <label className="label-caps mb-1 block">Type</label>
              <select className="field-base text-xs" value={form.type}
                onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                <option value="regular">Regular Holiday</option>
                <option value="special_non_working">Special Non-Working</option>
              </select>
            </div>
            <button onClick={addHoliday} disabled={saving}
              className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-400 text-xs disabled:opacity-50">
              {saving ? 'Adding...' : 'Add'}
            </button>
            {msg && <span className="text-xs text-signal-danger">{msg}</span>}
          </div>
        </div>

        {/* Holiday list */}
        {loading ? (
          <div className="text-center py-8 text-navy-400">Loading...</div>
        ) : (
          <div className="table-shell">
            <table className="table-base">
              <thead className="table-head-row">
                <tr>
                  {['Date', 'Name', 'Type', ''].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holidays.length === 0 ? (
                  <tr><td colSpan={4} className="table-empty">No holidays for {year}</td></tr>
                ) : holidays.map(h => (
                  <tr key={h._id} className="table-row">
                    <td className="px-4 py-2.5 text-navy-300">{new Date(h.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', weekday: 'short' })}</td>
                    <td className="px-4 py-2.5 font-medium text-navy-100">{h.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-md text-2xs font-medium ${h.type === 'regular' ? 'bg-signal-danger/12 text-signal-danger border border-signal-danger/25' : 'bg-signal-warning/12 text-signal-warning border border-signal-warning/25'}`}>
                        {h.type === 'regular' ? 'Regular' : 'Special'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => handleDelete(h._id)} className="text-signal-danger/80 hover:text-signal-danger text-2xs">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  )
}
