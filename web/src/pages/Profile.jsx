import { useEffect, useMemo, useState } from 'react'
import { getMyUserProfile, updateMyUserProfile, verifyPassword } from '../config/api'
import { useAuth } from '../contexts/AuthContext'
import { Input } from '../components/ui/Input'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import { hasFreshSensitiveAuth, markSensitiveAuthNow } from '../lib/sensitiveAuth'

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  client_admin: 'Client Admin',
  hr_payroll: 'HR / Payroll',
  branch_manager: 'Branch Manager',
  employee: 'Employee',
  auditor: 'Auditor',
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })
}

export default function Profile() {
  const { updateUserProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [wantsPasswordChange, setWantsPasswordChange] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [reauthOpen, setReauthOpen] = useState(false)
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthLoading, setReauthLoading] = useState(false)
  const [reauthError, setReauthError] = useState('')
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    oldPassword: '',
    password: '',
    confirmPassword: '',
    profilePictureUrl: '',
  })

  const hydrateForm = (data) => ({
    firstName: data?.firstName || '',
    lastName: data?.lastName || '',
    email: data?.email || '',
    oldPassword: '',
    password: '',
    confirmPassword: '',
    profilePictureUrl: data?.profilePictureUrl || '',
  })

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')
      try {
        const result = await getMyUserProfile()
        const data = result?.data || null
        if (!active || !data) return
        setProfile(data)
        setForm(hydrateForm(data))
      } catch (err) {
        if (active) setError(err.message || 'Failed to load profile')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [])

  const initials = useMemo(() => {
    const first = (form.firstName || profile?.firstName || '').trim()
    const last = (form.lastName || profile?.lastName || '').trim()
    const chars = `${first.charAt(0)}${last.charAt(0)}`.trim()
    return chars ? chars.toUpperCase() : 'U'
  }, [form.firstName, form.lastName, profile?.firstName, profile?.lastName])

  const displayName = useMemo(() => {
    const joined = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim()
    return joined || 'User Account'
  }, [profile?.firstName, profile?.lastName])

  const lastUpdated = useMemo(() => {
    if (!profile?.updatedAt) return 'Unknown'
    const date = new Date(profile.updatedAt)
    if (Number.isNaN(date.getTime())) return 'Unknown'
    return date.toLocaleString()
  }, [profile?.updatedAt])

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const onSelectImage = async (event) => {
    if (!isEditing) return

    const file = event.target.files?.[0]
    if (!file) return

    setError('')
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be 2MB or smaller')
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      setField('profilePictureUrl', dataUrl)
    } catch (err) {
      setError(err.message || 'Unable to process selected image')
    }
  }

  const removePicture = () => {
    if (!isEditing) return
    setField('profilePictureUrl', '')
  }

  const beginEditing = () => {
    setError('')
    setSuccess('')
    if (hasFreshSensitiveAuth()) {
      setIsEditing(true)
      return
    }
    setReauthError('')
    setReauthPassword('')
    setReauthOpen(true)
  }

  const confirmReauth = async () => {
    if (!reauthPassword) {
      setReauthError('Password is required')
      return
    }

    setReauthLoading(true)
    setReauthError('')
    try {
      await verifyPassword(reauthPassword)
      markSensitiveAuthNow()
      setReauthOpen(false)
      setReauthPassword('')
      setIsEditing(true)
    } catch (err) {
      setReauthError(err.message || 'Password verification failed')
    } finally {
      setReauthLoading(false)
    }
  }

  const cancelEditing = () => {
    setError('')
    setSuccess('')
    setIsEditing(false)
    setWantsPasswordChange(false)
    setForm(hydrateForm(profile))
  }

  const togglePasswordChange = () => {
    setWantsPasswordChange((prev) => {
      const next = !prev
      if (!next) {
        setForm((current) => ({ ...current, oldPassword: '', password: '', confirmPassword: '' }))
      }
      return next
    })
  }

  const saveProfile = async () => {
    setError('')
    setSuccess('')

    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError('First name, last name, and email are required')
      return
    }

    if (wantsPasswordChange) {
      if (!form.oldPassword) {
        setError('Current password is required')
        return
      }
      if (!form.password || form.password.length < 6) {
        setError('New password must be at least 6 characters')
        return
      }
      if (form.password !== form.confirmPassword) {
        setError('Password confirmation does not match')
        return
      }
    }

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      profilePictureUrl: form.profilePictureUrl || null,
    }

    if (wantsPasswordChange) {
      payload.oldPassword = form.oldPassword
      payload.password = form.password
    }

    setSaving(true)
    try {
      const result = await updateMyUserProfile(payload)
      const userData = result?.data || null
      if (userData) {
        setProfile(userData)
        setForm(hydrateForm(userData))
        setIsEditing(false)
        setWantsPasswordChange(false)
        updateUserProfile({
          id: userData._id,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          tenantId: userData.tenantId,
          branchId: userData.branchId?._id || userData.branchId || null,
          employeeId: userData.employeeId?._id || userData.employeeId || null,
          profilePictureUrl: userData.profilePictureUrl || null,
        })
      }
      setSuccess('Profile updated successfully')
    } catch (err) {
      setError(err.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      <div className="absolute -top-32 -right-24 w-96 h-96 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-20 w-[26rem] h-[26rem] rounded-full bg-navy-500/20 blur-3xl pointer-events-none" />

      <div className="px-6 py-4 border-b border-navy-500 bg-navy-800/90 backdrop-blur-sm relative z-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-accent-300">Account Center</p>
            <h1 className="text-lg font-semibold text-navy-50 tracking-tight mt-1">My Profile</h1>
            <p className="text-xs text-navy-300 mt-1">Manage your account details, photo, and security settings.</p>
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-2xs uppercase tracking-[0.14em] text-navy-400">Last Update</p>
            <p className="text-xs text-navy-200 mt-1">{lastUpdated}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 relative z-10">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-1 bg-gradient-to-b from-navy-700/80 to-navy-800 border border-navy-500/60 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="label-caps">Profile Picture</p>
              <span className="inline-flex h-6 items-center px-2 rounded-md text-2xs font-semibold bg-accent/10 text-accent-300 border border-accent/20">
                {ROLE_LABELS[profile?.role] || profile?.role || 'User'}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-4">
              {form.profilePictureUrl ? (
                <img
                  src={form.profilePictureUrl}
                  alt="Profile"
                  className="w-24 h-24 rounded-2xl border border-navy-400/70 object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl border border-navy-400/70 bg-gradient-to-br from-navy-600 to-navy-700 text-navy-100 flex items-center justify-center text-2xl font-semibold">
                  {initials}
                </div>
              )}

              <div className="space-y-2 min-w-0">
                <p className="text-sm font-semibold text-navy-50 truncate">{displayName}</p>
                <p className="text-2xs text-navy-300 font-mono truncate">{profile?.email || '—'}</p>
                {isEditing && (
                  <label className="inline-flex items-center justify-center h-7 px-3 text-xs font-medium rounded-md border border-navy-500 text-navy-100 bg-navy-600 hover:bg-navy-500 cursor-pointer transition-colors duration-80">
                    Upload
                    <input type="file" accept="image/*" className="hidden" onChange={onSelectImage} />
                  </label>
                )}
                {isEditing ? (
                  <Button variant="ghost" size="xs" onClick={removePicture}>
                    Remove Picture
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-navy-500/40 space-y-3">
              <p className="label-caps">Account Details</p>
              <div className="grid grid-cols-1 gap-2">
                <div className="rounded-lg border border-navy-500/40 bg-navy-700/35 px-3 py-2">
                  <p className="text-2xs uppercase tracking-[0.13em] text-navy-400">Role</p>
                  <p className="text-xs text-navy-100 mt-1">{ROLE_LABELS[profile?.role] || profile?.role || '—'}</p>
                </div>
                <div className="rounded-lg border border-navy-500/40 bg-navy-700/35 px-3 py-2">
                  <p className="text-2xs uppercase tracking-[0.13em] text-navy-400">Branch</p>
                  <p className="text-xs text-navy-100 mt-1">{profile?.branchId?.name || '—'}</p>
                </div>
              </div>
              {profile?.employeeId && (
                <div className="rounded-lg border border-navy-500/40 bg-navy-700/35 px-3 py-2">
                  <p className="text-2xs uppercase tracking-[0.13em] text-navy-400">Employee Link</p>
                  <p className="text-xs text-navy-100 mt-1">
                    {[profile.employeeId.firstName, profile.employeeId.lastName].filter(Boolean).join(' ')}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="lg:col-span-2 bg-navy-800/95 border border-navy-500/60 rounded-2xl p-5 md:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="label-caps">Profile Information</p>
                <p className="text-xs text-navy-300 mt-1">Keep your contact and login details up to date.</p>
              </div>
              {!isEditing ? (
                <Button variant="primary" size="sm" onClick={beginEditing}>
                  Edit Profile
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={cancelEditing}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" loading={saving} onClick={saveProfile}>
                    Save Changes
                  </Button>
                </div>
              )}
            </div>

            {error && (
              <p className="text-2xs text-signal-danger px-3 py-2 bg-signal-danger/8 border border-signal-danger/25 rounded-md">
                {error}
              </p>
            )}
            {success && (
              <p className="text-2xs text-signal-success px-3 py-2 bg-signal-success/10 border border-signal-success/30 rounded-md">
                {success}
              </p>
            )}

            {!isEditing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-navy-500/40 bg-navy-700/35 px-4 py-3">
                  <p className="label-caps">First Name</p>
                  <p className="text-sm text-navy-100 mt-1.5">{profile?.firstName || '—'}</p>
                </div>
                <div className="rounded-xl border border-navy-500/40 bg-navy-700/35 px-4 py-3">
                  <p className="label-caps">Last Name</p>
                  <p className="text-sm text-navy-100 mt-1.5">{profile?.lastName || '—'}</p>
                </div>
                <div className="md:col-span-2 rounded-xl border border-navy-500/40 bg-navy-700/35 px-4 py-3">
                  <p className="label-caps">Email</p>
                  <p className="text-sm text-navy-100 mt-1.5 font-mono break-all">{profile?.email || '—'}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    label="First Name"
                    value={form.firstName}
                    onChange={(e) => setField('firstName', e.target.value)}
                  />
                  <Input
                    label="Last Name"
                    value={form.lastName}
                    onChange={(e) => setField('lastName', e.target.value)}
                  />
                </div>

                <Input
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                />

                <div className="pt-1 border-t border-navy-500/30">
                  <Button variant="outline" size="sm" onClick={togglePasswordChange}>
                    {wantsPasswordChange ? 'Cancel Password Change' : 'Change Password'}
                  </Button>
                </div>

                {wantsPasswordChange && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      label="Current Password"
                      type="password"
                      value={form.oldPassword}
                      onChange={(e) => setField('oldPassword', e.target.value)}
                    />
                    <Input
                      label="New Password"
                      type="password"
                      value={form.password}
                      onChange={(e) => setField('password', e.target.value)}
                    />
                    <div className="md:col-span-2">
                      <Input
                        label="Confirm New Password"
                        type="password"
                        value={form.confirmPassword}
                        onChange={(e) => setField('confirmPassword', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {reauthOpen && (
        <Modal
          title="Confirm Password"
          subtitle="Re-enter your password before editing profile details."
          width="max-w-md"
          onClose={() => setReauthOpen(false)}
          onConfirm={confirmReauth}
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
                  confirmReauth()
                }
              }}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
