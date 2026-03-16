/**
 * Branches Page — manage branches and departments.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  getBranches, createBranch, updateBranch, deleteBranch,
  getDepartments, createDepartment, updateDepartment, deleteDepartment, verifyPassword,
} from '../config/api'
import { hasFreshSensitiveAuth, markSensitiveAuthNow } from '../lib/sensitiveAuth'
import { useAuth } from '../contexts/AuthContext'
import Modal from '../components/ui/Modal'
import { Input, Textarea, Select } from '../components/ui/Input'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'

// ── Shared table styles ──────────────────────────────────────────────
const th = 'label-caps px-4 py-2.5 text-left'

export default function Branches() {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'super_admin'

  const [tab, setTab] = useState('branches')

  const [branches, setBranches] = useState([])
  const [depts,    setDepts]    = useState([])
  const [loading,  setLoading]  = useState(true)

  // Branch modal
  const [branchModal,  setBranchModal]  = useState(false)
  const [branchEdit,   setBranchEdit]   = useState(null)
  const [branchForm,   setBranchForm]   = useState({ name: '', code: '', address: '', phone: '' })
  const [branchSaving, setBranchSaving] = useState(false)
  const [branchErr,    setBranchErr]    = useState('')

  // Dept modal
  const [deptModal,  setDeptModal]  = useState(false)
  const [deptEdit,   setDeptEdit]   = useState(null)
  const [deptForm,   setDeptForm]   = useState({ name: '', code: '', description: '', branchId: '' })
  const [deptSaving, setDeptSaving] = useState(false)
  const [deptErr,    setDeptErr]    = useState('')
  const [reauthOpen, setReauthOpen] = useState(false)
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthError, setReauthError] = useState('')
  const [reauthLoading, setReauthLoading] = useState(false)
  const [pendingSensitiveAction, setPendingSensitiveAction] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [bRes, dRes] = await Promise.all([getBranches(), getDepartments()])
      setBranches(bRes?.data || [])
      setDepts(dRes?.data    || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Branch handlers ──────────────────────────────────────────────
  const openBranchCreate = () => {
    setBranchEdit(null)
    setBranchForm({ name: '', code: '', address: '', phone: '' })
    setBranchErr('')
    setBranchModal(true)
  }
  const openBranchEdit = (b) => {
    setBranchEdit(b._id)
    setBranchForm({ name: b.name, code: b.code, address: b.address || '', phone: b.phone || '' })
    setBranchErr('')
    setBranchModal(true)
  }
  const saveBranchCore = async () => {
    setBranchErr('')
    setBranchSaving(true)
    try {
      branchEdit ? await updateBranch(branchEdit, branchForm) : await createBranch(branchForm)
      setBranchModal(false)
      load()
    } catch (err) { setBranchErr(err.message) }
    finally { setBranchSaving(false) }
  }
  const deleteBranchCore = async (id) => {
    if (!window.confirm('Delete this branch?')) return
    await deleteBranch(id)
    load()
  }

  // ── Dept handlers ────────────────────────────────────────────────
  const openDeptCreate = () => {
    setDeptEdit(null)
    setDeptForm({ name: '', code: '', description: '', branchId: '' })
    setDeptErr('')
    setDeptModal(true)
  }
  const openDeptEdit = (d) => {
    setDeptEdit(d._id)
    setDeptForm({ name: d.name, code: d.code || '', description: d.description || '', branchId: d.branchId || '' })
    setDeptErr('')
    setDeptModal(true)
  }
  const saveDeptCore = async () => {
    setDeptErr('')
    setDeptSaving(true)
    try {
      deptEdit ? await updateDepartment(deptEdit, deptForm) : await createDepartment(deptForm)
      setDeptModal(false)
      load()
    } catch (err) { setDeptErr(err.message) }
    finally { setDeptSaving(false) }
  }
  const deleteDeptCore = async (id) => {
    if (!window.confirm('Delete this department?')) return
    await deleteDepartment(id)
    load()
  }

  const requestSensitiveAction = (action) => {
    if (hasFreshSensitiveAuth()) {
      if (action.type === 'save_branch') {
        saveBranchCore()
      }
      if (action.type === 'delete_branch' && action.id) {
        deleteBranchCore(action.id)
      }
      if (action.type === 'save_dept') {
        saveDeptCore()
      }
      if (action.type === 'delete_dept' && action.id) {
        deleteDeptCore(action.id)
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

      if (action?.type === 'save_branch') {
        await saveBranchCore()
      }
      if (action?.type === 'delete_branch' && action.id) {
        await deleteBranchCore(action.id)
      }
      if (action?.type === 'save_dept') {
        await saveDeptCore()
      }
      if (action?.type === 'delete_dept' && action.id) {
        await deleteDeptCore(action.id)
      }
    } catch (err) {
      setReauthError(err.message || 'Password verification failed')
    } finally {
      setReauthLoading(false)
    }
  }

  const saveBranch = () => requestSensitiveAction({ type: 'save_branch' })
  const handleDeleteBranch = (id) => requestSensitiveAction({ type: 'delete_branch', id })
  const saveDept = () => requestSensitiveAction({ type: 'save_dept' })
  const handleDeleteDept = (id) => requestSensitiveAction({ type: 'delete_dept', id })

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-3.5
                      border-b border-navy-500 bg-navy-800">
        <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">
          Branches &amp; Departments
        </h1>
      </div>

      {/* Tab bar + CTA */}
      <div className="flex items-center justify-between px-6 py-2.5
                      border-b border-navy-500/50 bg-navy-800">
        <div className="flex gap-1">
          {['branches', 'departments'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 h-7 text-xs font-medium uppercase tracking-wider
                         transition-colors duration-80 rounded-md
                         ${tab === t
                           ? 'bg-accent text-white'
                           : 'text-navy-300 hover:text-navy-100 hover:bg-navy-700'}`}
            >
              {t}
            </button>
          ))}
        </div>
        {(isSuperAdmin || tab !== 'branches') && (
          <Button
            variant="primary"
            size="sm"
            onClick={tab === 'branches' ? openBranchCreate : openDeptCreate}
          >
            + Add {tab === 'branches' ? 'Branch' : 'Department'}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
        ) : tab === 'branches' ? (
          <div className="table-shell">
            <table className="table-base">
              <thead className="sticky top-0 z-10">
                <tr className="table-head-row">
                  {['Code', 'Name', 'Address', 'Phone', 'Actions'].map(h => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {branches.length === 0 ? (
                  <tr><td colSpan={5} className="table-empty">No branches yet.</td></tr>
                ) : branches.map((b, i) => (
                  <tr key={b._id}
                      className={`table-row ${i % 2 !== 0 ? 'table-row-alt' : ''}`}>
                  <td className="px-4 py-2.5 font-mono text-navy-300">{b.code}</td>
                  <td className="px-4 py-2.5 font-medium text-navy-100">{b.name}</td>
                  <td className="px-4 py-2.5 text-navy-300">{b.address || '—'}</td>
                  <td className="px-4 py-2.5 text-navy-300">{b.phone || '—'}</td>
                  <td className="px-4 py-2.5 flex gap-3">
                    <button onClick={() => openBranchEdit(b)}
                      className="text-accent hover:text-accent-200 transition-colors">Edit</button>
                    <button onClick={() => handleDeleteBranch(b._id)}
                      className="text-signal-danger/70 hover:text-signal-danger transition-colors">Delete</button>
                  </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-shell">
            <table className="table-base">
              <thead className="sticky top-0 z-10">
                <tr className="table-head-row">
                  {['Code', 'Name', 'Branch', 'Description', 'Actions'].map(h => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {depts.length === 0 ? (
                  <tr><td colSpan={5} className="table-empty">No departments yet.</td></tr>
                ) : depts.map((d, i) => {
                  const branch = branches.find(b => b._id === (d.branchId?._id || d.branchId))
                  return (
                    <tr key={d._id}
                        className={`table-row ${i % 2 !== 0 ? 'table-row-alt' : ''}`}>
                    <td className="px-4 py-2.5 font-mono text-navy-300">{d.code || '—'}</td>
                    <td className="px-4 py-2.5 font-medium text-navy-100">{d.name}</td>
                    <td className="px-4 py-2.5 text-navy-300">{branch?.name || '—'}</td>
                    <td className="px-4 py-2.5 text-navy-400">{d.description || '—'}</td>
                    <td className="px-4 py-2.5 flex gap-3">
                      <button onClick={() => openDeptEdit(d)}
                        className="text-accent hover:text-accent-200 transition-colors">Edit</button>
                      <button onClick={() => handleDeleteDept(d._id)}
                        className="text-signal-danger/70 hover:text-signal-danger transition-colors">Delete</button>
                    </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Branch Modal */}
      {branchModal && (
        <Modal
          title={branchEdit ? 'Edit Branch' : 'Add Branch'}
          width="max-w-md"
          onClose={() => setBranchModal(false)}
          onConfirm={saveBranch}
          confirmLabel="Save"
          loading={branchSaving}
        >
          <div className="space-y-3">
            {branchErr && (
              <p className="text-2xs text-signal-danger px-3 py-2 bg-signal-danger/8
                            border border-signal-danger/25 rounded-md">{branchErr}</p>
            )}
            <Input label="Code *" value={branchForm.code}
              onChange={e => setBranchForm(p => ({ ...p, code: e.target.value }))} placeholder="e.g. HQ" />
            <Input label="Name *" value={branchForm.name}
              onChange={e => setBranchForm(p => ({ ...p, name: e.target.value }))} />
            <Input label="Address" value={branchForm.address}
              onChange={e => setBranchForm(p => ({ ...p, address: e.target.value }))} />
            <Input label="Phone" value={branchForm.phone}
              onChange={e => setBranchForm(p => ({ ...p, phone: e.target.value }))} />
          </div>
        </Modal>
      )}

      {/* Department Modal */}
      {deptModal && (
        <Modal
          title={deptEdit ? 'Edit Department' : 'Add Department'}
          width="max-w-md"
          onClose={() => setDeptModal(false)}
          onConfirm={saveDept}
          confirmLabel="Save"
          loading={deptSaving}
        >
          <div className="space-y-3">
            {deptErr && (
              <p className="text-2xs text-signal-danger px-3 py-2 bg-signal-danger/8
                            border border-signal-danger/25 rounded-md">{deptErr}</p>
            )}
            <Input label="Name *" value={deptForm.name}
              onChange={e => setDeptForm(p => ({ ...p, name: e.target.value }))} />
            <Input label="Code" value={deptForm.code}
              onChange={e => setDeptForm(p => ({ ...p, code: e.target.value }))} />
            <Select label="Branch" value={deptForm.branchId}
              onChange={e => setDeptForm(p => ({ ...p, branchId: e.target.value }))}>
              <option value="">None</option>
              {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </Select>
            <Textarea label="Description" rows={2} value={deptForm.description}
              onChange={e => setDeptForm(p => ({ ...p, description: e.target.value }))} />
          </div>
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



