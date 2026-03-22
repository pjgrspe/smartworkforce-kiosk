/**
 * Payroll — Holidays page.
 */

import { useState, useEffect, useCallback } from 'react'
import { getHolidays, createHoliday, deleteHoliday, bulkHolidays } from '../config/api'

// ── PH holidays generator ─────────────────────────────────────────
function easterDate(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100
  const d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day   = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(y, month - 1, day)
}

function lastMondayOfAugust(y) {
  const d = new Date(y, 8, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getPHHolidays(y) {
  const easter = easterDate(y)
  const maundy   = new Date(easter); maundy.setDate(easter.getDate() - 3)
  const goodFri  = new Date(easter); goodFri.setDate(easter.getDate() - 2)
  const blackSat = new Date(easter); blackSat.setDate(easter.getDate() - 1)
  const heroesDay = lastMondayOfAugust(y)
  return [
    { name: "New Year's Day",                     date: `${y}-01-01`, type: 'regular' },
    { name: 'People Power Revolution',            date: `${y}-02-25`, type: 'special_non_working' },
    { name: 'Araw ng Kagitingan',                 date: `${y}-04-09`, type: 'regular' },
    { name: 'Maundy Thursday',                    date: fmt(maundy),  type: 'regular' },
    { name: 'Good Friday',                        date: fmt(goodFri), type: 'regular' },
    { name: 'Black Saturday',                     date: fmt(blackSat),type: 'special_non_working' },
    { name: 'Labor Day',                          date: `${y}-05-01`, type: 'regular' },
    { name: 'Independence Day',                   date: `${y}-06-12`, type: 'regular' },
    { name: 'Ninoy Aquino Day',                   date: `${y}-08-21`, type: 'special_non_working' },
    { name: 'National Heroes Day',                date: fmt(heroesDay), type: 'regular' },
    { name: 'All Saints Day',                     date: `${y}-11-01`, type: 'special_non_working' },
    { name: 'All Souls Day',                      date: `${y}-11-02`, type: 'special_non_working' },
    { name: 'Bonifacio Day',                      date: `${y}-11-30`, type: 'regular' },
    { name: 'Feast of the Immaculate Conception', date: `${y}-12-08`, type: 'special_non_working' },
    { name: 'Christmas Eve',                      date: `${y}-12-24`, type: 'special_non_working' },
    { name: 'Christmas Day',                      date: `${y}-12-25`, type: 'regular' },
    { name: 'Rizal Day',                          date: `${y}-12-30`, type: 'regular' },
    { name: "New Year's Eve",                     date: `${y}-12-31`, type: 'special_non_working' },
  ]
}

// ── Page ──────────────────────────────────────────────────────────
export default function PayrollHolidays() {
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

  const seedPHHolidays = async () => {
    if (!window.confirm(`This will add official PH ${year} holidays. Continue?`)) return
    setSeeding(true)
    try {
      await bulkHolidays(getPHHolidays(year))
      load()
    } catch (err) { setMsg(err.message) }
    finally { setSeeding(false) }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-navy-500 bg-navy-800">
        <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">Holidays</h1>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-6">

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="label-caps">Year</label>
            <input type="number" className="field-base h-8 w-24 text-xs"
              value={year} onChange={e => setYear(+e.target.value)} />
          </div>
          <button onClick={seedPHHolidays} disabled={seeding}
            className="px-3 py-1.5 text-xs bg-signal-success text-white rounded-md hover:opacity-90 disabled:opacity-50">
            {seeding ? 'Seeding...' : `Seed PH ${year} Holidays`}
          </button>
          {msg && <span className="text-xs text-signal-danger">{msg}</span>}
        </div>

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
          </div>
        </div>

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
