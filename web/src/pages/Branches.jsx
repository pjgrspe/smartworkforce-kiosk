/**
 * Branches Page — manage branches and departments.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  getBranches, createBranch, updateBranch, deleteBranch,
  getDepartments, createDepartment, updateDepartment, deleteDepartment
} from '../config/api'

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none'

function Modal({ title, onClose, onSave, saving, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
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

export default function Branches() {
  const [tab, setTab] = useState('branches')

  const [branches, setBranches] = useState([])
  const [depts,    setDepts]    = useState([])
  const [loading,  setLoading]  = useState(true)

  // Branch modal state
  const [branchModal, setBranchModal] = useState(false)
  const [branchEdit,  setBranchEdit]  = useState(null)
  const [branchForm,  setBranchForm]  = useState({ name: '', code: '', address: '', phone: '' })
  const [branchSaving, setBranchSaving] = useState(false)
  const [branchErr,   setBranchErr]   = useState('')

  // Department modal state
  const [deptModal, setDeptModal] = useState(false)
  const [deptEdit,  setDeptEdit]  = useState(null)
  const [deptForm,  setDeptForm]  = useState({ name: '', code: '', description: '', branchId: '' })
  const [deptSaving, setDeptSaving] = useState(false)
  const [deptErr,   setDeptErr]   = useState('')

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

  // ── Branch handlers ───────────────────────────────────────────
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

  const saveBranch = async () => {
    setBranchErr('')
    setBranchSaving(true)
    try {
      branchEdit ? await updateBranch(branchEdit, branchForm) : await createBranch(branchForm)
      setBranchModal(false)
      load()
    } catch (err) { setBranchErr(err.message) }
    finally { setBranchSaving(false) }
  }

  const handleDeleteBranch = async (id) => {
    if (!window.confirm('Delete this branch?')) return
    await deleteBranch(id)
    load()
  }

  // ── Department handlers ───────────────────────────────────────
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

  const saveDept = async () => {
    setDeptErr('')
    setDeptSaving(true)
    try {
      deptEdit ? await updateDepartment(deptEdit, deptForm) : await createDepartment(deptForm)
      setDeptModal(false)
      load()
    } catch (err) { setDeptErr(err.message) }
    finally { setDeptSaving(false) }
  }

  const handleDeleteDept = async (id) => {
    if (!window.confirm('Delete this department?')) return
    await deleteDepartment(id)
    load()
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Branches & Departments</h2>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {['branches', 'departments'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : tab === 'branches' ? (
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-4 border-b flex justify-between items-center">
            <span className="font-semibold text-gray-700">Branches ({branches.length})</span>
            <button onClick={openBranchCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
              + Add Branch
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Code', 'Name', 'Address', 'Phone', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {branches.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No branches yet</td></tr>
              ) : branches.map(b => (
                <tr key={b._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{b.code}</td>
                  <td className="px-4 py-3 font-medium">{b.name}</td>
                  <td className="px-4 py-3 text-gray-500">{b.address || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{b.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openBranchEdit(b)} className="text-blue-600 hover:underline mr-3 text-xs">Edit</button>
                    <button onClick={() => handleDeleteBranch(b._id)} className="text-red-500 hover:underline text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-4 border-b flex justify-between items-center">
            <span className="font-semibold text-gray-700">Departments ({depts.length})</span>
            <button onClick={openDeptCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
              + Add Department
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Code', 'Name', 'Branch', 'Description', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {depts.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No departments yet</td></tr>
              ) : depts.map(d => {
                const branch = branches.find(b => b._id === (d.branchId?._id || d.branchId))
                return (
                  <tr key={d._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{d.code || '—'}</td>
                    <td className="px-4 py-3 font-medium">{d.name}</td>
                    <td className="px-4 py-3 text-gray-500">{branch?.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{d.description || '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => openDeptEdit(d)} className="text-blue-600 hover:underline mr-3 text-xs">Edit</button>
                      <button onClick={() => handleDeleteDept(d._id)} className="text-red-500 hover:underline text-xs">Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Branch Modal */}
      {branchModal && (
        <Modal title={branchEdit ? 'Edit Branch' : 'Add Branch'} onClose={() => setBranchModal(false)} onSave={saveBranch} saving={branchSaving}>
          {branchErr && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{branchErr}</div>}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Code *</label>
            <input className={inputCls} value={branchForm.code} onChange={e => setBranchForm(p => ({ ...p, code: e.target.value }))} placeholder="e.g. HQ" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
            <input className={inputCls} value={branchForm.name} onChange={e => setBranchForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
            <input className={inputCls} value={branchForm.address} onChange={e => setBranchForm(p => ({ ...p, address: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
            <input className={inputCls} value={branchForm.phone} onChange={e => setBranchForm(p => ({ ...p, phone: e.target.value }))} />
          </div>
        </Modal>
      )}

      {/* Department Modal */}
      {deptModal && (
        <Modal title={deptEdit ? 'Edit Department' : 'Add Department'} onClose={() => setDeptModal(false)} onSave={saveDept} saving={deptSaving}>
          {deptErr && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{deptErr}</div>}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
            <input className={inputCls} value={deptForm.name} onChange={e => setDeptForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Code</label>
            <input className={inputCls} value={deptForm.code} onChange={e => setDeptForm(p => ({ ...p, code: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Branch</label>
            <select className={inputCls} value={deptForm.branchId} onChange={e => setDeptForm(p => ({ ...p, branchId: e.target.value }))}>
              <option value="">None</option>
              {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea className={inputCls} rows={2} value={deptForm.description} onChange={e => setDeptForm(p => ({ ...p, description: e.target.value }))} />
          </div>
        </Modal>
      )}
    </div>
  )
}
