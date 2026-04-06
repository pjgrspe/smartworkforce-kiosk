/**
 * Tenants Page — super_admin only.
 * List, create, and edit tenants (companies).
 */
import { useState, useEffect, useCallback } from 'react'
import { getTenants, createTenant, updateTenant } from '../config/api'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import { Input, Textarea } from '../components/ui/Input'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'

const EMPTY = {
  name: '', code: '', domain: '', contactEmail: '',
  contactPhone: '', address: '', isActive: true,
}

function TenantModal({ initial, onClose, onSave }) {
  const editing = !!initial?.id
  const [form, setForm]     = useState(initial ? { ...EMPTY, ...initial } : { ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return setError('Name is required')
    if (!form.code.trim()) return setError('Code is required')
    setSaving(true)
    setError('')
    try {
      const payload = {
        name:         form.name.trim(),
        code:         form.code.trim().toUpperCase(),
        domain:       form.domain.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        address:      form.address.trim() || null,
        isActive:     form.isActive,
      }
      if (editing) {
        const res = await updateTenant(initial.id, payload)
        onSave(res.data)
      } else {
        const res = await createTenant(payload)
        onSave(res.data)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={editing ? 'Edit Tenant' : 'New Tenant'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label-caps mb-1 block">Company Name *</label>
            <Input value={form.name} onChange={set('name')} placeholder="DE WEBNET Solutions" autoFocus />
          </div>
          <div>
            <label className="label-caps mb-1 block">Tenant Code *</label>
            <Input
              value={form.code}
              onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="DEWEBNET"
              className="font-mono"
            />
            <p className="text-2xs text-navy-400 mt-1">Unique identifier used by kiosk installers</p>
          </div>
          <div>
            <label className="label-caps mb-1 block">Domain</label>
            <Input value={form.domain} onChange={set('domain')} placeholder="company.com" />
          </div>
          <div>
            <label className="label-caps mb-1 block">Contact Email</label>
            <Input value={form.contactEmail} onChange={set('contactEmail')} placeholder="admin@company.com" type="email" />
          </div>
          <div>
            <label className="label-caps mb-1 block">Contact Phone</label>
            <Input value={form.contactPhone} onChange={set('contactPhone')} placeholder="+63 900 000 0000" />
          </div>
          <div className="col-span-2">
            <label className="label-caps mb-1 block">Address</label>
            <Textarea value={form.address} onChange={set('address')} rows={2} placeholder="Full company address" />
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <input
              id="isActive"
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))}
              className="w-4 h-4 accent-accent"
            />
            <label htmlFor="isActive" className="text-sm text-navy-200 cursor-pointer">Active</label>
          </div>
        </div>

        {error && <p className="text-signal-danger text-sm">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner size="sm" /> : editing ? 'Save Changes' : 'Create Tenant'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Tenants() {
  const [tenants, setTenants]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [search,  setSearch]    = useState('')
  const [modal,   setModal]     = useState(false)
  const [editing, setEditing]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getTenants()
      setTenants(res.data || [])
    } catch {
      setTenants([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() { setEditing(null); setModal(true) }
  function openEdit(t)  { setEditing(t);    setModal(true) }
  function closeModal() { setModal(false);  setEditing(null) }

  function handleSave(saved) {
    setTenants(prev => {
      const idx = prev.findIndex(t => t.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = saved; return next
      }
      return [saved, ...prev]
    })
    closeModal()
  }

  async function toggleActive(t) {
    try {
      const res = await updateTenant(t.id, { isActive: !t.isActive })
      setTenants(prev => prev.map(x => x.id === t.id ? res.data : x))
    } catch (err) {
      alert(err.message)
    }
  }

  const filtered = tenants.filter(t =>
    !search ||
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.code?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy-50">Tenants</h1>
          <p className="text-sm text-navy-400 mt-0.5">Manage companies registered on this platform</p>
        </div>
        <Button onClick={openCreate}>+ New Tenant</Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or code..."
          className="max-w-xs"
        />
        <span className="text-sm text-navy-400">{filtered.length} tenant{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="table-shell overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Spinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-navy-400 text-sm">No tenants found</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-navy-600/50">
                <th className="label-caps px-4 py-2.5 text-left">Company Name</th>
                <th className="label-caps px-4 py-2.5 text-left">Code</th>
                <th className="label-caps px-4 py-2.5 text-left">Domain</th>
                <th className="label-caps px-4 py-2.5 text-left">Contact</th>
                <th className="label-caps px-4 py-2.5 text-left">Status</th>
                <th className="label-caps px-4 py-2.5 text-left">Created</th>
                <th className="label-caps px-4 py-2.5 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-600/30">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-navy-800/40 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-navy-100">{t.name}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs bg-navy-700 px-2 py-0.5 rounded text-accent">{t.code}</span>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-navy-300">{t.domain || '—'}</td>
                  <td className="px-4 py-2.5 text-sm text-navy-300">
                    {t.contactEmail || t.contactPhone || '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={t.isActive ? 'success' : 'neutral'}>
                      {t.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-navy-400">
                    {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => openEdit(t)}
                        className="text-2xs text-accent hover:text-accent-200 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(t)}
                        className={`text-2xs transition-colors ${
                          t.isActive
                            ? 'text-signal-danger/70 hover:text-signal-danger'
                            : 'text-signal-success/70 hover:text-signal-success'
                        }`}
                      >
                        {t.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <TenantModal initial={editing} onClose={closeModal} onSave={handleSave} />
      )}
    </div>
  )
}
