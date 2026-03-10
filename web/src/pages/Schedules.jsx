/**
 * Schedules Page — manage work schedules.
 */

import { useState, useEffect, useCallback } from 'react'
import { getSchedules, createSchedule, updateSchedule, deleteSchedule } from '../config/api'

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const EMPTY = {
  name: '', code: '', type: 'fixed',
  shiftStart: '08:00', shiftEnd: '17:00',
  breakStart: '12:00', breakEnd: '13:00',
  breakDurationMinutes: 60, isPaidBreak: false,
  gracePeriodMinutes: 5, undertimePolicyMinutes: 0,
  roundingRuleMinutes: 0, allowMultiplePunches: false,
  restDays: [0]
}

function Modal({ title, onClose, onSave, saving, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto pt-10 pb-10">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onSave} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Schedules() {
  const [schedules, setSchedules] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId,    setEditId]    = useState(null)
  const [form,      setForm]      = useState(EMPTY)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getSchedules()
      setSchedules(res?.data || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditId(null); setForm(EMPTY); setError(''); setShowModal(true)
  }

  const openEdit = (s) => {
    setEditId(s._id)
    setForm({
      name: s.name, code: s.code, type: s.type,
      shiftStart: s.shiftStart || '08:00', shiftEnd: s.shiftEnd || '17:00',
      breakStart: s.breakStart || '12:00', breakEnd: s.breakEnd || '13:00',
      breakDurationMinutes: s.breakDurationMinutes ?? 60,
      isPaidBreak: s.isPaidBreak || false,
      gracePeriodMinutes: s.gracePeriodMinutes ?? 5,
      undertimePolicyMinutes: s.undertimePolicyMinutes ?? 0,
      roundingRuleMinutes: s.roundingRuleMinutes ?? 0,
      allowMultiplePunches: s.allowMultiplePunches || false,
      restDays: s.restDays || [0]
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    setError(''); setSaving(true)
    try {
      editId ? await updateSchedule(editId, form) : await createSchedule(form)
      setShowModal(false); load()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this schedule?')) return
    await deleteSchedule(id); load()
  }

  const toggleRestDay = (day) => {
    setForm(prev => ({
      ...prev,
      restDays: prev.restDays.includes(day)
        ? prev.restDays.filter(d => d !== day)
        : [...prev.restDays, day]
    }))
  }

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Schedules</h2>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          + Add Schedule
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Code', 'Name', 'Type', 'Shift', 'Break', 'Grace', 'Rest Days', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {schedules.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No schedules yet</td></tr>
              ) : schedules.map(s => (
                <tr key={s._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{s.code}</td>
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">{s.type}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.shiftStart} – {s.shiftEnd}</td>
                  <td className="px-4 py-3 text-gray-500">{s.breakDurationMinutes}m {s.isPaidBreak ? '(paid)' : ''}</td>
                  <td className="px-4 py-3 text-gray-500">{s.gracePeriodMinutes}m</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{(s.restDays || []).map(d => DAYS[d]).join(', ')}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(s)} className="text-blue-600 hover:underline mr-3 text-xs">Edit</button>
                    <button onClick={() => handleDelete(s._id)} className="text-red-500 hover:underline text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editId ? 'Edit Schedule' : 'Add Schedule'} onClose={() => setShowModal(false)} onSave={handleSave} saving={saving}>
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input className={inputCls} value={form.name} onChange={e => setF('name', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Code *</label>
              <input className={inputCls} value={form.code} onChange={e => setF('code', e.target.value.toUpperCase())} placeholder="e.g. DAYSHIFT_8_5" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select className={inputCls} value={form.type} onChange={e => setF('type', e.target.value)}>
                <option value="fixed">Fixed</option>
                <option value="shifting">Shifting</option>
                <option value="flexible">Flexible</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Shift Start</label>
              <input type="time" className={inputCls} value={form.shiftStart} onChange={e => setF('shiftStart', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Shift End</label>
              <input type="time" className={inputCls} value={form.shiftEnd} onChange={e => setF('shiftEnd', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Break Duration (min)</label>
              <input type="number" className={inputCls} value={form.breakDurationMinutes} onChange={e => setF('breakDurationMinutes', +e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Grace Period (min)</label>
              <input type="number" className={inputCls} value={form.gracePeriodMinutes} onChange={e => setF('gracePeriodMinutes', +e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rounding Rule (min)</label>
              <input type="number" className={inputCls} value={form.roundingRuleMinutes} onChange={e => setF('roundingRuleMinutes', +e.target.value)} />
            </div>
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isPaidBreak} onChange={e => setF('isPaidBreak', e.target.checked)} />
              Paid Break
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.allowMultiplePunches} onChange={e => setF('allowMultiplePunches', e.target.checked)} />
              Allow Multiple Punches
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Rest Days</label>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map((day, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleRestDay(i)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${
                    form.restDays.includes(i) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
