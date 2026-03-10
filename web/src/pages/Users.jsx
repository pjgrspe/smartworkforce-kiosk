/**
 * Users Page — admin-only user management.
 */
import { useState, useEffect, useCallback } from 'react'
import { getUsers, createUser, updateUser, deleteUser } from '../config/api'
import { getBranches } from '../config/api'

const ROLES = [
  { value: 'super_admin',    label: 'Super Admin' },
  { value: 'client_admin',  label: 'Client Admin' },
  { value: 'hr_payroll',    label: 'HR / Payroll' },
  { value: 'branch_manager',label: 'Branch Manager' },
  { value: 'employee',      label: 'Employee' },
  { value: 'auditor',       label: 'Auditor' },
]

const ROLE_COLOR = {
  super_admin:    'bg-purple-100 text-purple-700',
  client_admin:   'bg-indigo-100 text-indigo-700',
  hr_payroll:     'bg-blue-100 text-blue-700',
  branch_manager: 'bg-cyan-100 text-cyan-700',
  employee:       'bg-gray-100 text-gray-700',
  auditor:        'bg-yellow-100 text-yellow-700',
}

const EMPTY = { email: '', firstName: '', lastName: '', role: 'employee', branchId: '', password: '', isActive: true }

function UserModal({ initial, branches, onClose, onSave }) {
  const editing = !!initial?._id
  const [form, setForm]   = useState(initial ? { ...EMPTY, ...initial, password: '' } : { ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }))

  const submit = async () => {
    if (!form.email || !form.role) { setError('Email and role are required'); return }
    if (!editing && !form.password) { setError('Password is required for new users'); return }
    setSaving(true); setError('')
    const payload = { ...form }
    if (!payload.password) delete payload.password  // don't send empty password on edit
    try { onSave(await (editing ? updateUser(initial._id, payload) : createUser(payload))) }
    catch (err) { setError(err.message); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <h3 className="text-lg font-semibold">{editing ? 'Edit User' : 'Create User'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">First Name</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.firstName} onChange={e => set('firstName', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.lastName} onChange={e => set('lastName', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
            <input type="email" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.email} onChange={e => set('email', e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Password {editing && <span className="text-gray-400 font-normal">(leave blank to keep current)</span>}
            </label>
            <input type="password" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.password} onChange={e => set('password', e.target.value)}
              placeholder={editing ? '••••••••' : 'Required'} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role *</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.role} onChange={e => set('role', e.target.value)}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Branch</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.branchId} onChange={e => set('branchId', e.target.value)}>
                <option value="">— None —</option>
                {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="isActive" checked={form.isActive}
              onChange={e => set('isActive', e.target.checked)} className="w-4 h-4 rounded" />
            <label htmlFor="isActive" className="text-sm text-gray-700">Active</label>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : (editing ? 'Update' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Users() {
  const [users,    setUsers]    = useState([])
  const [branches, setBranches] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [modal,    setModal]    = useState(null)  // null | 'create' | user-object
  const [deleteId, setDeleteId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setUsers((await getUsers())?.data || []) }
    catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    getBranches().then(r => setBranches(r?.data || [])).catch(() => {})
  }, [load])

  const handleSave = async (res) => {
    setModal(null)
    await load()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try { await deleteUser(deleteId); setDeleteId(null); load() }
    catch (err) { alert(err.message) }
  }

  const branchName = (id) => branches.find(b => b._id === id)?.name || '—'

  const filtered = users.filter(u =>
    !search || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">User Accounts</h2>
        <button onClick={() => setModal('create')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          + Add User
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b">
          <input placeholder="Search by name or email…"
            className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Name', 'Email', 'Role', 'Branch', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No users found</td></tr>
              ) : filtered.map(u => (
                <tr key={u._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">
                      {[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLOR[u.role] || 'bg-gray-100 text-gray-700'}`}>
                      {ROLES.find(r => r.value === u.role)?.label || u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.branchId ? branchName(u.branchId) : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => setModal(u)}
                      className="text-xs px-2 py-1 rounded border hover:bg-gray-50">Edit</button>
                    <button onClick={() => setDeleteId(u._id)}
                      className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <UserModal
          initial={modal === 'create' ? null : modal}
          branches={branches}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-80">
            <p className="text-gray-800 font-medium mb-4">Delete this user?</p>
            <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-3 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete} className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
