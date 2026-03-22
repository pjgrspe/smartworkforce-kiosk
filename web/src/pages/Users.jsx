/**
 * Users Page — admin-only user management.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getUsers, createUser, updateUser, deleteUser, getBranches, getEmployees, getTenants, verifyPassword } from '../config/api'
import { hasFreshSensitiveAuth, markSensitiveAuthNow } from '../lib/sensitiveAuth'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import { Input, Select } from '../components/ui/Input'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'

const ROLES = [
  { value: 'super_admin',    label: 'Super Admin' },
  { value: 'client_admin',  label: 'Client Admin' },
  { value: 'hr_payroll',    label: 'HR / Payroll' },
  { value: 'branch_manager',label: 'Branch Manager' },
  { value: 'employee',      label: 'Employee' },
  { value: 'auditor',       label: 'Auditor' },
]

const ROLE_VARIANT = {
  super_admin:    'danger',
  client_admin:   'blue',
  hr_payroll:     'info',
  branch_manager: 'warning',
  employee:       'neutral',
  auditor:        'success',
}

const EMPTY = { email: '', firstName: '', lastName: '', role: 'employee', branchId: '', employeeId: '', tenantId: '', password: '', isActive: true }

function SortIcon({ dir }) {
  if (!dir) return <span className="ml-1 text-navy-500">↕</span>
  return <span className="ml-1 text-accent">{dir === 'asc' ? '↑' : '↓'}</span>
}

function useSortable(initial, initialDir = 'asc') {
  const [col, setCol] = useState(initial)
  const [dir, setDir] = useState(initialDir)
  const toggle = (c) => {
    if (col === c) setDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setCol(c); setDir('asc') }
  }
  return { col, dir, toggle }
}

// ── User Modal ────────────────────────────────────────────────────────
function UserModal({ initial, branches, employees, tenants, currentUser, onClose, onSave }) {
  const editing = !!initial?._id
  const initialForm = initial
    ? {
        ...EMPTY,
        ...initial,
        branchId: typeof initial.branchId === 'object' ? initial.branchId?._id || '' : initial.branchId || '',
        employeeId: typeof initial.employeeId === 'object' ? initial.employeeId?._id || '' : initial.employeeId || '',
        tenantId: initial.tenantId || '',
        password: '',
      }
    : { ...EMPTY }
  const [form, setForm]   = useState(initialForm)
  const [oldPassword, setOldPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const editingSelf = editing && initial?._id === currentUser?._id

  const branchLocked = !['super_admin', 'client_admin'].includes(currentUser?.role) && !!currentUser?.branchId
  const roleOptions = currentUser?.role === 'super_admin'
    ? ROLES
    : ROLES.filter((role) => ['hr_payroll', 'branch_manager', 'employee', 'auditor'].includes(role.value))
  const requiresEmployeeLink = form.role === 'employee'
  const effectiveBranchId = branchLocked ? currentUser?.branchId : form.branchId
  const visibleBranches = currentUser?.role === 'super_admin' && form.tenantId
    ? branches.filter(b => b.tenantId === form.tenantId)
    : branches
  const visibleEmployees = employees.filter((employee) => {
    if (!effectiveBranchId) return true
    return String(employee.branchId) === String(effectiveBranchId)
  })

  useEffect(() => {
    if (branchLocked) {
      setForm((prev) => ({ ...prev, branchId: currentUser.branchId }))
    }
  }, [branchLocked, currentUser?.branchId])

  useEffect(() => {
    if (!requiresEmployeeLink && form.employeeId) {
      setForm((prev) => ({ ...prev, employeeId: '' }))
      return
    }

    if (requiresEmployeeLink && form.employeeId && !visibleEmployees.some((employee) => employee._id === form.employeeId)) {
      setForm((prev) => ({ ...prev, employeeId: '' }))
    }
  }, [requiresEmployeeLink, form.employeeId, visibleEmployees])

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }))

  const submit = async () => {
    if (!form.email || !form.role) { setError('Email and role are required'); return }
    if (!editing && !form.password) { setError('Password is required for new users'); return }
    if (editingSelf && form.password && !oldPassword) { setError('Current password is required to set a new password'); return }
    if (requiresEmployeeLink && !form.employeeId) { setError('Employee accounts must be linked to an employee profile'); return }
    setSaving(true); setError('')
    const payload = { ...form }
    if (!payload.password) delete payload.password
    if (editingSelf && payload.password) payload.oldPassword = oldPassword
    if (!requiresEmployeeLink) delete payload.employeeId
    try { onSave(await (editing ? updateUser(initial._id, payload) : createUser(payload))) }
    catch (err) { setError(err.message); setSaving(false) }
  }

  return (
    <Modal
      title={editing ? 'Edit User' : 'Create User'}
      width="max-w-lg"
      onClose={onClose}
      onConfirm={submit}
      loading={saving}
    >
      <div className="space-y-3">
        {error && (
          <p className="text-2xs text-signal-danger px-3 py-2 bg-signal-danger/8
                        border border-signal-danger/25 rounded-md">{error}</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="First Name" value={form.firstName}
            onChange={e => set('firstName', e.target.value)} />
          <Input label="Last Name" value={form.lastName}
            onChange={e => set('lastName', e.target.value)} />
        </div>
        <Input label="Email *" type="email" value={form.email}
          onChange={e => set('email', e.target.value)} />
        <Input
          label={editing ? 'Password (blank = keep current)' : 'Password *'}
          type="password"
          value={form.password}
          placeholder={editing ? '••••••••' : 'Required'}
          onChange={e => set('password', e.target.value)}
        />
        {editingSelf && form.password && (
          <Input
            label="Current Password *"
            type="password"
            value={oldPassword}
            placeholder="Enter your current password"
            onChange={e => setOldPassword(e.target.value)}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Select label="Role *" value={form.role}
            onChange={e => set('role', e.target.value)}>
            {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
          <Select label={branchLocked ? 'Branch (Locked)' : 'Branch'} value={form.branchId}
            onChange={e => set('branchId', e.target.value)} disabled={branchLocked}>
            <option value="">— None —</option>
            {visibleBranches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </Select>
        </div>
        {currentUser?.role === 'super_admin' && (
          <Select label="Company (Tenant)" value={form.tenantId}
            onChange={e => setForm(p => ({ ...p, tenantId: e.target.value, branchId: '' }))}>
            <option value="">— None —</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        )}
        {requiresEmployeeLink && (
          <Select label="Linked Employee *" value={form.employeeId}
            onChange={e => set('employeeId', e.target.value)}>
            <option value="">— Select Employee —</option>
            {visibleEmployees.map(employee => (
              <option key={employee._id} value={employee._id}>
                {[employee.firstName, employee.lastName].filter(Boolean).join(' ')} {employee.employeeCode ? `(${employee.employeeCode})` : ''}
              </option>
            ))}
          </Select>
        )}
        {branchLocked && (
          <p className="text-2xs text-navy-300">This account can only manage users for its assigned branch.</p>
        )}
        {requiresEmployeeLink && (
          <p className="text-2xs text-navy-300">Employee accounts use this linked profile for self-service attendance, corrections, and payslips.</p>
        )}
        <label className="flex items-center gap-2 text-xs text-navy-200 cursor-pointer">
          <input type="checkbox" className="accent-accent w-3.5 h-3.5"
            checked={form.isActive} onChange={e => set('isActive', e.target.checked)} />
          Active
        </label>
      </div>
    </Modal>
  )
}

// ── Page ──────────────────────────────────────────────────────────────
export default function Users() {
  const { user } = useAuth()
  const [users,    setUsers]    = useState([])
  const [branches, setBranches] = useState([])
  const [employees, setEmployees] = useState([])
  const [tenants,  setTenants]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [modal,    setModal]    = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [reauthOpen, setReauthOpen] = useState(false)
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthError, setReauthError] = useState('')
  const [reauthLoading, setReauthLoading] = useState(false)
  const [pendingSensitiveAction, setPendingSensitiveAction] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const { col, dir, toggle } = useSortable('name')

  const load = useCallback(async () => {
    setLoading(true)
    try { setUsers((await getUsers())?.data || []) }
    catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    getBranches().then(r => setBranches(r?.data || [])).catch(() => {})
    getEmployees().then(r => setEmployees(r?.data || [])).catch(() => {})
    if (user?.role === 'super_admin') {
      getTenants().then(r => setTenants(r?.data || [])).catch(() => {})
    }
  }, [load])

  useEffect(() => {
    if (!selectedUser?._id) return
    const next = users.find((item) => item._id === selectedUser._id)
    if (next) setSelectedUser(next)
  }, [users, selectedUser?._id])

  const handleSave = async () => { setModal(null); await load() }

  const handleDelete = async () => {
    if (!deleteId) return
    try { await deleteUser(deleteId); setDeleteId(null); load() }
    catch (err) { alert(err.message) }
  }

  const requestSensitiveAction = (action) => {
    if (hasFreshSensitiveAuth()) {
      if (action.type === 'edit' && action.user) {
        setModal(action.user)
      }
      if (action.type === 'delete' && action.id) {
        setDeleteId(action.id)
      }
      if (action.type === 'view' && action.user) {
        setSelectedUser(action.user)
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

      if (action?.type === 'edit' && action.user) {
        setModal(action.user)
      }
      if (action?.type === 'delete' && action.id) {
        setDeleteId(action.id)
      }
      if (action?.type === 'view' && action.user) {
        setSelectedUser(action.user)
      }
    } catch (err) {
      setReauthError(err.message || 'Password verification failed')
    } finally {
      setReauthLoading(false)
    }
  }

  const branchName = (value) => {
    if (!value) return '—'
    if (typeof value === 'object') return value.name || '—'
    return branches.find(b => b._id === value)?.name || '—'
  }

  const getBranchSortKey = (u) => {
    if (!u.branchId) return ''
    if (typeof u.branchId === 'object') return (u.branchId.name || '').toLowerCase()
    return (branches.find(b => b._id === u.branchId)?.name || '').toLowerCase()
  }

  const filtered = users.filter(u =>
    !search || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  )

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av, bv
      if (col === 'name') { av = `${a.firstName} ${a.lastName}`.toLowerCase(); bv = `${b.firstName} ${b.lastName}`.toLowerCase() }
      else if (col === 'email') { av = (a.email||'').toLowerCase(); bv = (b.email||'').toLowerCase() }
      else if (col === 'role') { av = a.role||''; bv = b.role||'' }
      else if (col === 'company') { av = (tenants.find(t => t.id === a.tenantId)?.name || '').toLowerCase(); bv = (tenants.find(t => t.id === b.tenantId)?.name || '').toLowerCase() }
      else if (col === 'branch') { av = getBranchSortKey(a); bv = getBranchSortKey(b) }
      else if (col === 'status') { av = a.isActive?'active':'inactive'; bv = b.isActive?'active':'inactive' }
      else return 0
      if (av < bv) return dir === 'asc' ? -1 : 1
      if (av > bv) return dir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, col, dir, branches])

  const employeeMap = new Map(employees.map((employee) => [employee._id, employee]))

  const formatDateTime = (value) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString()
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-3.5
                      border-b border-navy-500 bg-navy-800">
        <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">
          User Accounts
        </h1>
        <Button variant="primary" size="md" onClick={() => setModal('create')}>
          + Add User
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-2.5 border-b border-navy-500/50 bg-navy-800">
        <div className="ml-auto w-56">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="w-full h-8 px-3 text-xs bg-navy-700 border border-navy-500 text-navy-100 placeholder:text-navy-400 rounded-md focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
        ) : (
          <div className="table-shell">
            <table className="table-base">
              <thead className="sticky top-0 z-10">
                <tr className="table-head-row">
                  <th className="table-th cursor-pointer select-none hover:text-navy-100 transition-colors" onClick={() => toggle('name')}>Name <SortIcon dir={col==='name'?dir:null}/></th>
                  <th className="table-th cursor-pointer select-none hover:text-navy-100 transition-colors" onClick={() => toggle('email')}>Email <SortIcon dir={col==='email'?dir:null}/></th>
                  <th className="table-th cursor-pointer select-none hover:text-navy-100 transition-colors" onClick={() => toggle('role')}>Role <SortIcon dir={col==='role'?dir:null}/></th>
                  {user?.role === 'super_admin' && (
                    <th className="table-th cursor-pointer select-none hover:text-navy-100 transition-colors" onClick={() => toggle('company')}>Company <SortIcon dir={col==='company'?dir:null}/></th>
                  )}
                  <th className="table-th cursor-pointer select-none hover:text-navy-100 transition-colors" onClick={() => toggle('branch')}>Branch <SortIcon dir={col==='branch'?dir:null}/></th>
                  <th className="table-th cursor-pointer select-none hover:text-navy-100 transition-colors" onClick={() => toggle('status')}>Status <SortIcon dir={col==='status'?dir:null}/></th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={user?.role === 'super_admin' ? 7 : 6} className="table-empty">
                      No users found.
                    </td>
                  </tr>
                ) : sorted.map((u, i) => (
                  <tr key={u._id}
                      className={`table-row cursor-pointer ${i % 2 !== 0 ? 'table-row-alt' : ''} ${selectedUser?._id === u._id ? 'bg-accent/10' : ''}`}
                      onClick={() => requestSensitiveAction({ type: 'view', user: u })}>
                  <td className="px-4 py-2.5 font-medium text-navy-100">
                    {[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-navy-300 font-mono">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={ROLE_VARIANT[u.role] ?? 'neutral'}>
                      {ROLES.find(r => r.value === u.role)?.label ?? u.role}
                    </Badge>
                  </td>
                  {user?.role === 'super_admin' && (
                    <td className="px-4 py-2.5 text-navy-400 text-xs">
                      {u.tenantId ? (tenants.find(t => t.id === u.tenantId)?.name || '—') : <span className="text-navy-500">All</span>}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-navy-400">
                    {u.branchId ? branchName(u.branchId) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={u.isActive ? 'active' : 'inactive'}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {(() => {
                      const CLIENT_ADMIN_MANAGEABLE = ['client_admin', 'hr_payroll', 'branch_manager', 'employee', 'auditor']
                      const canManage = user?.role === 'super_admin' || CLIENT_ADMIN_MANAGEABLE.includes(u.role)
                      if (!canManage) return null
                      return (
                        <div className="flex items-center gap-3">
                          <button onClick={(event) => { event.stopPropagation(); requestSensitiveAction({ type: 'edit', user: u }) }}
                            className="text-2xs text-accent hover:text-accent-200 transition-colors">
                            Edit
                          </button>
                          <button onClick={(event) => { event.stopPropagation(); requestSensitiveAction({ type: 'delete', id: u._id }) }}
                            className="text-2xs text-signal-danger/70 hover:text-signal-danger transition-colors">
                            Delete
                          </button>
                        </div>
                      )
                    })()}
                  </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedUser && (
          <div className="mt-5 table-shell p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="label-caps">User Profile</p>
                <p className="mt-1 text-sm font-semibold text-navy-100">
                  {[selectedUser.firstName, selectedUser.lastName].filter(Boolean).join(' ') || '—'}
                </p>
                <p className="text-2xs text-navy-300 mt-1">{selectedUser.email}</p>
              </div>
              {(() => {
                const CLIENT_ADMIN_MANAGEABLE = ['client_admin', 'hr_payroll', 'branch_manager', 'employee', 'auditor']
                const canManage = user?.role === 'super_admin' || CLIENT_ADMIN_MANAGEABLE.includes(selectedUser.role)
                if (!canManage) return null
                return (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => requestSensitiveAction({ type: 'edit', user: selectedUser })}>Edit User</Button>
                    <Button size="sm" variant="danger" onClick={() => requestSensitiveAction({ type: 'delete', id: selectedUser._id })}>Delete User</Button>
                  </div>
                )
              })()}
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <div className="rounded-md border border-navy-500 bg-navy-700/40 px-4 py-3">
                <p className="label-caps">Identity</p>
                <p className="mt-2 text-xs text-navy-100">Role: {ROLES.find((role) => role.value === selectedUser.role)?.label || selectedUser.role || '—'}</p>
                <p className="mt-1 text-xs text-navy-300">Status: {selectedUser.isActive ? 'Active' : 'Inactive'}</p>
                <p className="mt-1 text-xs text-navy-300">Branch: {selectedUser.branchId ? branchName(selectedUser.branchId) : '—'}</p>
              </div>

              <div className="rounded-md border border-navy-500 bg-navy-700/40 px-4 py-3">
                <p className="label-caps">Access Scope</p>
                <p className="mt-2 text-xs text-navy-100 break-all">
                  Tenant: {tenants.find(t => t.id === selectedUser.tenantId)?.name || selectedUser.tenantId || '—'}
                </p>
                <p className="mt-1 text-xs text-navy-300 break-all">Branch ID: {(typeof selectedUser.branchId === 'object' ? selectedUser.branchId?._id : selectedUser.branchId) || '—'}</p>
                <p className="mt-1 text-xs text-navy-300 break-all">Employee Link ID: {(typeof selectedUser.employeeId === 'object' ? selectedUser.employeeId?._id : selectedUser.employeeId) || '—'}</p>
              </div>

              <div className="rounded-md border border-navy-500 bg-navy-700/40 px-4 py-3">
                <p className="label-caps">Audit</p>
                <p className="mt-2 text-xs text-navy-100">Last Login: {formatDateTime(selectedUser.lastLoginAt)}</p>
                <p className="mt-1 text-xs text-navy-300">Created: {formatDateTime(selectedUser.createdAt)}</p>
                <p className="mt-1 text-xs text-navy-300">Updated: {formatDateTime(selectedUser.updatedAt)}</p>
              </div>

              {selectedUser.employeeId && (
                <div className="rounded-md border border-navy-500 bg-navy-700/40 px-4 py-3 md:col-span-2 xl:col-span-3">
                  <p className="label-caps">Linked Employee</p>
                  <p className="mt-2 text-xs text-navy-100">
                    {(() => {
                      const linkedId = typeof selectedUser.employeeId === 'object' ? selectedUser.employeeId?._id : selectedUser.employeeId
                      const linked = employeeMap.get(linkedId)
                      if (!linked) return linkedId || '—'
                      return `${linked.firstName || ''} ${linked.lastName || ''}`.trim() || linked.employeeCode || linkedId
                    })()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {modal && (
        <UserModal
          initial={modal === 'create' ? null : modal}
          branches={branches}
          employees={employees}
          tenants={tenants}
          currentUser={user}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {deleteId && (
        <Modal
          title="Delete User"
          width="max-w-sm"
          onClose={() => setDeleteId(null)}
          onConfirm={handleDelete}
          confirmLabel="Delete"
          confirmVariant="danger"
        >
          <p className="text-sm text-navy-300">
            This action cannot be undone. The user will lose all access immediately.
          </p>
        </Modal>
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


