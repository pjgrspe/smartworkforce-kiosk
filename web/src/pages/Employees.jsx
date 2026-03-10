/**
 * Employees Page — full CRUD with create/edit modal.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getEmployees, createEmployee, updateEmployee, deleteEmployee,
  getBranches, getDepartments, getSchedules, enrollFace
} from '../config/api'
import * as faceapi from 'face-api.js'
import { useAuth } from '../contexts/AuthContext'

const EMPTY_FORM = {
  employeeCode: '', firstName: '', middleName: '', lastName: '',
  email: '', contactNumber: '', address: '', dateOfBirth: '', gender: '',
  branchId: '', departmentId: '', scheduleId: '',
  employment: {
    status: 'active', type: 'regular', position: '',
    dateHired: '', regularizationDate: ''
  },
  govIds: { tin: '', sss: '', philHealth: '', pagIbig: '' },
  bank: { bankName: '', accountNumber: '' },
  taxStatus: '', dependents: 0
}

function deepMerge(base, updates) {
  const result = { ...base }
  for (const key of Object.keys(updates)) {
    if (updates[key] !== null && typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
      result[key] = deepMerge(base[key] || {}, updates[key])
    } else {
      result[key] = updates[key]
    }
  }
  return result
}

function Badge({ status }) {
  const map = {
    active:     'bg-green-100 text-green-700',
    inactive:   'bg-gray-100 text-gray-600',
    resigned:   'bg-yellow-100 text-yellow-700',
    terminated: 'bg-red-100 text-red-700'
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

function Modal({ title, onClose, onSave, children, saving }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto pt-8 pb-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FormField({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none'

// ── Face Enrollment Modal ──────────────────────────────────────────────────────
const CDN_WEIGHTS = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights'
const SAMPLES_NEEDED = 5

// Step-by-step pose instructions — diverse angles improve the mean descriptor quality
const STEPS = [
  { label: 'Face forward',        icon: '😐', hint: 'Look straight at the camera. Keep your face centered and relaxed.' },
  { label: 'Turn slightly left',  icon: '↖️', hint: 'Slowly rotate your head a little to the left. Keep both eyes visible.' },
  { label: 'Turn slightly right', icon: '↗️', hint: 'Slowly rotate your head a little to the right. Keep both eyes visible.' },
  { label: 'Tilt chin down',      icon: '⬇️', hint: 'Lower your chin slightly while keeping your eyes on the camera.' },
  { label: 'Tilt chin up',        icon: '⬆️', hint: 'Raise your chin slightly while keeping your eyes on the camera.' },
]

function FaceEnrollModal({ employee, onClose, onDone }) {
  const videoRef  = useRef(null)
  const streamRef = useRef(null)

  // phase: cam-select | loading | ready | done | saving | error
  const [phase,    setPhase]    = useState('cam-select')
  const [cameras,  setCameras]  = useState([])
  const [selCam,   setSelCam]   = useState('')
  const [samples,  setSamples]  = useState([])
  const [step,     setStep]     = useState(0)       // which STEPS index we're on
  const [flash,    setFlash]    = useState(false)   // green flash on capture
  const [errMsg,   setErrMsg]   = useState('')
  const [faceOk,   setFaceOk]   = useState(false)   // live detection feedback
  const [detScore,  setDetScore] = useState(0)       // live detection quality score (0-1)
  const detLoopRef = useRef(null)

  // Enumerate cameras on mount
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(s => { s.getTracks().forEach(t => t.stop()) })
      .catch(() => {})
      .finally(() => {
        navigator.mediaDevices.enumerateDevices().then(devices => {
          const vids = devices.filter(d => d.kind === 'videoinput')
          setCameras(vids)
          setSelCam(vids[0]?.deviceId || '')
        })
      })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(detLoopRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // Live face-presence detection loop (runs while phase === 'ready')
  useEffect(() => {
    if (phase !== 'ready') return
    let alive = true
    const tick = async () => {
      if (!alive) return
      const video = videoRef.current
      if (video && video.readyState >= 2) {
        const det = await faceapi.detectSingleFace(
          video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 })
        )
        if (alive) {
          setFaceOk(!!det)
          setDetScore(det?.score ?? 0)
        }
      }
      if (alive) detLoopRef.current = requestAnimationFrame(tick)
    }
    detLoopRef.current = requestAnimationFrame(tick)
    return () => { alive = false; cancelAnimationFrame(detLoopRef.current) }
  }, [phase])

  const startCamera = async () => {
    setPhase('loading')
    setErrMsg('')
    try {
      // Load models
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(CDN_WEIGHTS),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(CDN_WEIGHTS),
        faceapi.nets.faceRecognitionNet.loadFromUri(CDN_WEIGHTS),
      ])
      // Start selected camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: selCam ? { exact: selCam } : undefined,
                 width: { ideal: 640 }, height: { ideal: 480 } }
      })
      streamRef.current = stream
      const video = videoRef.current
      video.srcObject = stream
      await new Promise(res => { video.onloadedmetadata = res })
      video.play()
      setPhase('ready')
    } catch (err) {
      setPhase('error')
      setErrMsg(err.message)
    }
  }

  const switchCamera = async (deviceId) => {
    setSelCam(deviceId)
    if (phase !== 'ready') return
    // Swap stream without going back to loading screen
    cancelAnimationFrame(detLoopRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
      })
      streamRef.current = stream
      const video = videoRef.current
      video.srcObject = stream
      await new Promise(res => { video.onloadedmetadata = res })
      video.play()
    } catch (err) { setErrMsg(err.message) }
  }

  const captureStep = async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    // High threshold (0.7) ensures only sharp, well-lit face captures are accepted
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.7 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor()
    if (!detection) {
      setFaceOk(false)
      setDetScore(0)
      return
    }
    const descriptor = Array.from(detection.descriptor)
    setFlash(true)
    setTimeout(() => setFlash(false), 300)
    setSamples(prev => {
      const next = [...prev, descriptor]
      const nextStep = next.length
      if (nextStep >= SAMPLES_NEEDED) {
        setPhase('done')
      } else {
        setStep(nextStep)
      }
      return next
    })
  }

  const saveEnrollment = async () => {
    setPhase('saving')
    try {
      await enrollFace(employee._id, samples)
      onDone()
    } catch (err) {
      setPhase('error')
      setErrMsg('Save failed: ' + err.message)
    }
  }

  const currentStep = STEPS[step] || STEPS[0]
  const progress = samples.length
  const showVideo = phase === 'loading' || phase === 'ready' || phase === 'done'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-purple-600 to-purple-500">
          <div>
            <h3 className="text-lg font-bold text-white">Face Enrollment</h3>
            <p className="text-purple-100 text-sm">{employee.firstName} {employee.lastName}</p>
          </div>
          <button onClick={onClose} className="text-purple-200 hover:text-white text-3xl leading-none font-light">×</button>
        </div>

        {/* ── Always-mounted video (hidden until camera is running) ── */}
        <div className={showVideo ? 'block' : 'hidden'}>
          {/* Progress bar — only during ready/done */}
          {(phase === 'ready' || phase === 'done') && (
            <div className="flex items-center gap-2 px-6 pt-5 mb-3">
              {STEPS.map((s, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs border-2 transition-all ${
                    i < progress  ? 'bg-green-500 border-green-500 text-white' :
                    i === progress && phase === 'ready' ? 'bg-purple-600 border-purple-600 text-white animate-pulse' :
                    'bg-white border-gray-300 text-gray-400'
                  }`}>
                    {i < progress ? '✓' : i + 1}
                  </div>
                  <span className="text-[10px] text-gray-400 text-center leading-tight hidden sm:block">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Camera switcher */}
          {cameras.length > 1 && (phase === 'ready' || phase === 'done') && (
            <div className="flex items-center gap-2 px-6 mb-2">
              <span className="text-xs text-gray-500 whitespace-nowrap">📷 Camera:</span>
              <select
                value={selCam}
                onChange={e => switchCamera(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-purple-400 outline-none"
              >
                {cameras.map((cam, i) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Video feed — always in DOM when showVideo, just overlays change */}
          <div className="relative bg-black mx-6 rounded-xl overflow-hidden aspect-video">
            <video
              ref={videoRef}
              autoPlay playsInline muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />

            {/* Loading spinner overlay */}
            {phase === 'loading' && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-4 border-purple-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-white text-sm">Loading AI models…</p>
              </div>
            )}

            {/* Green flash on capture */}
            {flash && (
              <div className="absolute inset-0 bg-green-400/50 pointer-events-none" />
            )}

            {/* Live quality indicator */}
            {phase === 'ready' && (
              <div className={`absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                detScore >= 0.7 ? 'bg-green-500 text-white' :
                faceOk         ? 'bg-yellow-500 text-white' : 'bg-red-500 text-white'
              }`}>
                <span className="w-2 h-2 rounded-full bg-white/80" />
                {detScore >= 0.7
                  ? `Quality: ${Math.round(detScore * 100)}%  ✓`
                  : faceOk
                  ? 'Adjust position or lighting'
                  : 'No face detected'}
              </div>
            )}

            {/* Done overlay */}
            {phase === 'done' && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-3xl">✓</div>
                <p className="text-white font-semibold text-lg">All poses captured!</p>
              </div>
            )}
          </div>

          {/* Instruction card */}
          {phase === 'ready' && (
            <div className="mx-6 mt-3 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <span className="text-2xl">{currentStep.icon}</span>
              <div>
                <p className="font-semibold text-purple-800 text-sm">Step {progress + 1} of {SAMPLES_NEEDED}: {currentStep.label}</p>
                <p className="text-purple-700 text-xs mt-0.5">{currentStep.hint}</p>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 px-6 py-5">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50 text-sm">
              Cancel
            </button>
            {phase === 'loading' && (
              <div className="flex-1 py-2.5 text-center text-sm text-gray-400">Starting camera…</div>
            )}
            {phase === 'ready' && (
              <button
                onClick={captureStep}
                disabled={detScore < 0.65}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-40 transition"
              >
                {detScore >= 0.65
                  ? `📸 Capture Pose ${progress + 1}/${SAMPLES_NEEDED}`
                  : '📷 Improve lighting / move closer'}
              </button>
            )}
            {phase === 'done' && (
              <button
                onClick={saveEnrollment}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition"
              >
                ✅ Save Enrollment
              </button>
            )}
          </div>
        </div>

        {/* ── Phase: camera selection ── */}
        {phase === 'cam-select' && (
          <div className="p-6 flex flex-col gap-5">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 leading-relaxed">
              <p className="font-semibold mb-1">📋 Before you begin:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Make sure the employee is present in front of the camera.</li>
                <li>Ensure the area is well-lit with no strong backlight.</li>
                <li>Remove sunglasses or anything covering the face.</li>
                <li>You will be asked to capture <strong>{SAMPLES_NEEDED} poses</strong> — the system will guide you through each one.</li>
              </ul>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Camera</label>
              {cameras.length === 0 ? (
                <p className="text-sm text-gray-500 italic">Detecting cameras…</p>
              ) : (
                <select
                  value={selCam}
                  onChange={e => setSelCam(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-400 outline-none"
                >
                  {cameras.map((cam, i) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <button
              onClick={startCamera}
              disabled={!selCam}
              className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-40 transition"
            >
              Start Enrollment →
            </button>
          </div>
        )}

        {/* ── Phase: saving ── */}
        {phase === 'saving' && (
          <div className="p-10 flex flex-col items-center gap-4 text-gray-600">
            <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Saving enrollment data…</p>
          </div>
        )}

        {/* ── Phase: error ── */}
        {phase === 'error' && (
          <div className="p-6 flex flex-col items-center gap-4">
            <div className="text-4xl">⚠️</div>
            <p className="text-red-600 text-sm text-center">{errMsg}</p>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Close</button>
              <button onClick={() => { setSamples([]); setStep(0); setPhase('cam-select') }} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">Try Again</button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default function Employees() {
  const { user } = useAuth()
  const canEdit = ['super_admin', 'client_admin', 'hr_payroll'].includes(user?.role)

  const [employees, setEmployees]   = useState([])
  const [branches,  setBranches]    = useState([])
  const [depts,     setDepts]       = useState([])
  const [schedules, setSchedules]   = useState([])
  const [loading,   setLoading]     = useState(true)
  const [search,    setSearch]      = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [editTarget, setEditTarget] = useState(null) // null = create
  const [form,      setForm]        = useState(EMPTY_FORM)
  const [saving,    setSaving]      = useState(false)
  const [error,     setError]       = useState('')
  const [faceEnrollTarget, setFaceEnrollTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [eRes, bRes, dRes, sRes] = await Promise.all([
        getEmployees(), getBranches(), getDepartments(), getSchedules()
      ])
      setEmployees(eRes?.data || [])
      setBranches(bRes?.data  || [])
      setDepts(dRes?.data     || [])
      setSchedules(sRes?.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowModal(true)
  }

  const openEdit = (emp) => {
    setEditTarget(emp._id)
    setForm(deepMerge(EMPTY_FORM, emp))
    setError('')
    setShowModal(true)
  }

  const setField = (path, value) => {
    setForm(prev => {
      const parts = path.split('.')
      if (parts.length === 1) return { ...prev, [path]: value }
      const top = { ...prev[parts[0]] }
      top[parts[1]] = value
      return { ...prev, [parts[0]]: top }
    })
  }

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      if (editTarget) {
        await updateEmployee(editTarget, form)
      } else {
        await createEmployee(form)
      }
      setShowModal(false)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this employee?')) return
    await deleteEmployee(id)
    load()
  }

  const filtered = employees.filter(e => {
    const q = search.toLowerCase()
    return (
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
      e.employeeCode?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Employees</h2>
        {canEdit && (
          <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            + Add Employee
          </button>
        )}
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, code, or email…"
          className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Code', 'Name', 'Email', 'Position', 'Branch', 'Status', canEdit ? 'Actions' : ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">No employees found</td></tr>
                ) : filtered.map(emp => {
                  const branch = branches.find(b => b._id === (emp.branchId?._id || emp.branchId))
                  return (
                    <tr key={emp._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs">{emp.employeeCode}</td>
                      <td className="px-4 py-3 font-medium">{emp.firstName} {emp.lastName}</td>
                      <td className="px-4 py-3 text-gray-500">{emp.email || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{emp.employment?.position || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{branch?.name || '—'}</td>
                      <td className="px-4 py-3"><Badge status={emp.employment?.status} /></td>
                      {canEdit && (
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button onClick={() => openEdit(emp)} className="text-blue-600 hover:underline mr-3 text-xs">Edit</button>
                          <button onClick={() => setFaceEnrollTarget(emp)} className="text-purple-600 hover:underline mr-3 text-xs">Enroll Face</button>
                          <button onClick={() => handleDelete(emp._id)} className="text-red-500 hover:underline text-xs">Delete</button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <Modal
          title={editTarget ? 'Edit Employee' : 'Add Employee'}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
          saving={saving}
        >
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Employee Code *">
              <input className={inputCls} value={form.employeeCode} onChange={e => setField('employeeCode', e.target.value)} />
            </FormField>
            <FormField label="First Name *">
              <input className={inputCls} value={form.firstName} onChange={e => setField('firstName', e.target.value)} />
            </FormField>
            <FormField label="Middle Name">
              <input className={inputCls} value={form.middleName} onChange={e => setField('middleName', e.target.value)} />
            </FormField>
            <FormField label="Last Name *">
              <input className={inputCls} value={form.lastName} onChange={e => setField('lastName', e.target.value)} />
            </FormField>
            <FormField label="Email">
              <input type="email" className={inputCls} value={form.email} onChange={e => setField('email', e.target.value)} />
            </FormField>
            <FormField label="Contact Number">
              <input className={inputCls} value={form.contactNumber} onChange={e => setField('contactNumber', e.target.value)} />
            </FormField>
            <FormField label="Date of Birth">
              <input type="date" className={inputCls} value={form.dateOfBirth?.slice(0,10) || ''} onChange={e => setField('dateOfBirth', e.target.value)} />
            </FormField>
            <FormField label="Gender">
              <select className={inputCls} value={form.gender} onChange={e => setField('gender', e.target.value)}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </FormField>
          </div>

          <h4 className="font-semibold text-gray-700 mt-5 mb-3">Employment Details</h4>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Branch *">
              <select className={inputCls} value={form.branchId} onChange={e => setField('branchId', e.target.value)}>
                <option value="">Select branch…</option>
                {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </FormField>
            <FormField label="Department">
              <select className={inputCls} value={form.departmentId} onChange={e => setField('departmentId', e.target.value)}>
                <option value="">Select dept…</option>
                {depts.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </FormField>
            <FormField label="Schedule">
              <select className={inputCls} value={form.scheduleId || ''} onChange={e => setField('scheduleId', e.target.value)}>
                <option value="">Default / No schedule</option>
                {schedules.map(s => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}
              </select>
            </FormField>
            <FormField label="Position">
              <input className={inputCls} value={form.employment?.position || ''} onChange={e => setField('employment.position', e.target.value)} />
            </FormField>
            <FormField label="Status">
              <select className={inputCls} value={form.employment?.status || 'active'} onChange={e => setField('employment.status', e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="resigned">Resigned</option>
                <option value="terminated">Terminated</option>
              </select>
            </FormField>
            <FormField label="Employment Type">
              <select className={inputCls} value={form.employment?.type || 'regular'} onChange={e => setField('employment.type', e.target.value)}>
                <option value="regular">Regular</option>
                <option value="probationary">Probationary</option>
                <option value="contractual">Contractual</option>
                <option value="part_time">Part-time</option>
              </select>
            </FormField>
            <FormField label="Date Hired">
              <input type="date" className={inputCls} value={form.employment?.dateHired?.slice(0,10) || ''} onChange={e => setField('employment.dateHired', e.target.value)} />
            </FormField>
          </div>

          <h4 className="font-semibold text-gray-700 mt-5 mb-3">Government IDs</h4>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="TIN"><input className={inputCls} value={form.govIds?.tin || ''} onChange={e => setField('govIds.tin', e.target.value)} /></FormField>
            <FormField label="SSS"><input className={inputCls} value={form.govIds?.sss || ''} onChange={e => setField('govIds.sss', e.target.value)} /></FormField>
            <FormField label="PhilHealth"><input className={inputCls} value={form.govIds?.philHealth || ''} onChange={e => setField('govIds.philHealth', e.target.value)} /></FormField>
            <FormField label="Pag-IBIG"><input className={inputCls} value={form.govIds?.pagIbig || ''} onChange={e => setField('govIds.pagIbig', e.target.value)} /></FormField>
          </div>

          <h4 className="font-semibold text-gray-700 mt-5 mb-3">Bank Details</h4>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Bank Name"><input className={inputCls} value={form.bank?.bankName || ''} onChange={e => setField('bank.bankName', e.target.value)} /></FormField>
            <FormField label="Account Number"><input className={inputCls} value={form.bank?.accountNumber || ''} onChange={e => setField('bank.accountNumber', e.target.value)} /></FormField>
          </div>
        </Modal>
      )}

      {faceEnrollTarget && (
        <FaceEnrollModal
          employee={faceEnrollTarget}
          onClose={() => setFaceEnrollTarget(null)}
          onDone={() => { setFaceEnrollTarget(null); load() }}
        />
      )}
    </div>
  )
}
