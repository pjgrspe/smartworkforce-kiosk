/**
 * Schedules Page — manage work schedules.
 */

import { useState, useEffect, useCallback } from 'react'
import { getSchedules, createSchedule, updateSchedule, deleteSchedule, verifyPassword } from '../config/api'
import { hasFreshSensitiveAuth, markSensitiveAuthNow } from '../lib/sensitiveAuth'
import Modal from '../components/ui/Modal'
import { Input, Select } from '../components/ui/Input'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'

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

export default function Schedules() {
  const [schedules, setSchedules] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId,    setEditId]    = useState(null)
  const [form,      setForm]      = useState(EMPTY)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [reauthOpen, setReauthOpen] = useState(false)
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthError, setReauthError] = useState('')
  const [reauthLoading, setReauthLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setSchedules((await getSchedules())?.data || []) }
    catch (err) { console.error(err) }
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
      restDays: s.restDays || [0],
    })
    setError(''); setShowModal(true)
  }

  const performSave = async () => {
    setError(''); setSaving(true)
    try {
      editId ? await updateSchedule(editId, form) : await createSchedule(form)
      setShowModal(false); load()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const performDelete = async (id) => {
    if (!window.confirm('Delete this schedule?')) return
    await deleteSchedule(id); load()
  }

  const requireSensitiveAuth = (action) => {
    if (hasFreshSensitiveAuth()) {
      if (action.type === 'save') {
        performSave()
      }
      if (action.type === 'delete' && action.id) {
        performDelete(action.id)
      }
      return
    }

    setPendingAction(action)
    setReauthPassword('')
    setReauthError('')
    setReauthOpen(true)
  }

  const handleSave = () => {
    requireSensitiveAuth({ type: 'save' })
  }

  const handleDelete = (id) => {
    requireSensitiveAuth({ type: 'delete', id })
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
      const action = pendingAction
      setPendingAction(null)
      setReauthOpen(false)
      setReauthPassword('')

      if (action?.type === 'save') {
        await performSave()
      }
      if (action?.type === 'delete' && action.id) {
        await performDelete(action.id)
      }
    } catch (err) {
      setReauthError(err.message || 'Password verification failed')
    } finally {
      setReauthLoading(false)
    }
  }

  const toggleRestDay = (day) => setForm(prev => ({
    ...prev,
    restDays: prev.restDays.includes(day)
      ? prev.restDays.filter(d => d !== day)
      : [...prev.restDays, day]
  }))

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-3.5
                      border-b border-navy-500 bg-navy-800">
        <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">
          Schedules
        </h1>
        <Button variant="primary" size="sm" onClick={openCreate}>+ Add Schedule</Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
        ) : (
          <div className="table-shell">
            <table className="table-base">
              <thead className="sticky top-0 z-10">
                <tr className="table-head-row">
                  {['Code', 'Name', 'Type', 'Shift', 'Break', 'Grace', 'Rest Days', ''].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedules.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="table-empty">
                      No schedules yet.
                    </td>
                  </tr>
                ) : schedules.map((s, i) => (
                  <tr key={s._id}
                      className={`table-row ${i % 2 !== 0 ? 'table-row-alt' : ''}`}>
                    <td className="px-4 py-2.5 font-mono text-navy-300">{s.code}</td>
                    <td className="px-4 py-2.5 font-medium text-navy-100">{s.name}</td>
                    <td className="px-4 py-2.5">
                      <span className="label-caps px-2 py-0.5 border border-navy-500 text-navy-300 rounded-md">
                        {s.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular text-navy-200">
                      {s.shiftStart} – {s.shiftEnd}
                    </td>
                    <td className="px-4 py-2.5 text-navy-400">
                      {s.breakDurationMinutes}m{s.isPaidBreak ? ' (paid)' : ''}
                    </td>
                    <td className="px-4 py-2.5 text-navy-400">{s.gracePeriodMinutes}m</td>
                    <td className="px-4 py-2.5 text-navy-400">
                      {(s.restDays || []).map(d => DAYS[d]).join(', ')}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => openEdit(s)}
                        className="text-2xs text-accent hover:text-accent-200 mr-3 transition-colors">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(s._id)}
                        className="text-2xs text-signal-danger/70 hover:text-signal-danger transition-colors">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <Modal
          title={editId ? 'Edit Schedule' : 'Add Schedule'}
          width="max-w-2xl"
          onClose={() => setShowModal(false)}
          onConfirm={handleSave}
          loading={saving}
        >
          <div className="space-y-4">
            {error && (
              <p className="text-2xs text-signal-danger px-3 py-2 bg-signal-danger/8
                            border border-signal-danger/25 rounded-md">{error}</p>
            )}

            <div className="grid grid-cols-3 gap-3">
              <Input label="Name *" value={form.name}
                onChange={e => setF('name', e.target.value)} />
              <Input label="Code *" value={form.code}
                onChange={e => setF('code', e.target.value.toUpperCase())}
                placeholder="DAYSHIFT_8_5" />
              <Select label="Type" value={form.type}
                onChange={e => setF('type', e.target.value)}>
                <option value="fixed">Fixed</option>
                <option value="shifting">Shifting</option>
                <option value="flexible">Flexible</option>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input type="time" label="Shift Start" value={form.shiftStart}
                onChange={e => setF('shiftStart', e.target.value)} />
              <Input type="time" label="Shift End" value={form.shiftEnd}
                onChange={e => setF('shiftEnd', e.target.value)} />
              <Input type="number" label="Break Duration (min)" value={form.breakDurationMinutes}
                onChange={e => setF('breakDurationMinutes', +e.target.value)} />
              <Input type="number" label="Grace Period (min)" value={form.gracePeriodMinutes}
                onChange={e => setF('gracePeriodMinutes', +e.target.value)} />
              <Input type="number" label="Rounding Rule (min)" value={form.roundingRuleMinutes}
                onChange={e => setF('roundingRuleMinutes', +e.target.value)} />
            </div>

            <div className="flex gap-6">
              {[['isPaidBreak', 'Paid Break'], ['allowMultiplePunches', 'Allow Multiple Punches']].map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-xs text-navy-200 cursor-pointer">
                  <input type="checkbox" className="accent-accent w-3.5 h-3.5"
                    checked={form[k]} onChange={e => setF(k, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>

            <div>
              <p className="label-caps mb-2">Rest Days</p>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map((day, i) => (
                  <button key={i} type="button" onClick={() => toggleRestDay(i)}
                    className={`px-3 py-1 text-2xs font-medium border rounded-md transition-colors
                      ${form.restDays.includes(i)
                        ? 'bg-accent text-white border-accent'
                        : 'bg-navy-600 text-navy-300 border-navy-500 hover:border-accent/50'}`}>
                    {day}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {reauthOpen && (
        <Modal
          title="Sensitive Action"
          subtitle="Re-enter your password to continue."
          width="max-w-md"
          onClose={() => { setReauthOpen(false); setPendingAction(null) }}
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


