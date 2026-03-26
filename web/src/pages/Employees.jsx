/**
 * Employees Page — full CRUD with create/edit modal.
 */

import { Fragment, useState, useEffect, useCallback, useRef } from 'react'
import {
  getEmployees, createEmployee, updateEmployee, deleteEmployee,
  getBranches, getDepartments, getSchedules, enrollFace, verifyPassword,
  uploadEmployeeDocument, deleteEmployeeDocument, downloadEmployeeDocument,
  getEmployeeDayOffs, createEmployeeDayOff, deleteEmployeeDayOff,
} from '../config/api'
import { useAuth } from '../contexts/AuthContext'
import { hasFreshSensitiveAuth, markSensitiveAuthNow } from '../lib/sensitiveAuth'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'

const EMPTY_FORM = {
  employeeCode: '', firstName: '', middleName: '', lastName: '',
  email: '', contactNumber: '', address: '', dateOfBirth: '', gender: '',
  branchId: '', departmentId: '', scheduleId: '', reportsToId: '',
  employment: {
    status: 'active', type: 'regular_with_leaves', position: '',
    dateHired: '', regularizationDate: ''
  },
  govIds: { tin: '', sss: '', philHealth: '', pagIbig: '' },
  bank: { bankName: '', accountNumber: '' },
  taxStatus: '', dependents: 0,
  leaveConfig: {
    leaveType: 'with_leaves',
    hasSl: true,
    hasVl: true,
    slQuota: null,
    vlQuota: null,
  }
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

const EMP_TYPE_LABEL = {
  regular_with_leaves:    'Regular with Leaves',
  regular_without_leaves: 'Regular without Leaves',
  probationary:           'Probationary',
  contractual:            'Contractual',
  part_time:              'Part-time',
}

const STATUS_VARIANT = {
  active: 'active',
  inactive: 'inactive',
  resigned: 'warning',
  terminated: 'danger'
}

function hasFaceEnrollment(employee) {
  return (employee?.faceData?.faceApiDescriptors?.length || employee?.faceData?.encodings?.length || 0) > 0
}

const DOC_CATEGORIES = [
  { value: 'tin',        label: 'TIN' },
  { value: 'sss',        label: 'SSS' },
  { value: 'philhealth', label: 'PhilHealth' },
  { value: 'pagibig',    label: 'Pag-IBIG' },
  { value: 'bank',       label: 'Bank' },
  { value: 'employment', label: 'Employment' },
  { value: 'other',      label: 'Other' },
]

function SectionHeading({ children }) {
  return <h3 className="label-caps mt-5 mb-3 text-navy-300">{children}</h3>
}

function Field({ label, children }) {
  return (
    <div>
      <p className="label-caps mb-1">{label}</p>
      {children}
    </div>
  )
}

function formatEmployeeError(message) {
  if (!message) return 'Unable to save employee.'
  if (message.includes('E11000') || message.includes('duplicate key')) {
    return 'Employee code already exists. Use a different code or restore the old employee record.'
  }
  if (message.includes('branchId is required')) {
    return 'Please select a branch for this employee.'
  }
  if (message.includes('departmentId') && message.includes('required')) {
    return 'Please select a department for this employee.'
  }
  if (message.includes('firstName') || message.includes('first_name')) {
    return 'First name is required.'
  }
  if (message.includes('lastName') || message.includes('last_name')) {
    return 'Last name is required.'
  }
  if (message.includes('employeeCode') || message.includes('employee_code')) {
    return 'Employee code is required and must be unique.'
  }
  return message
}

function validateEmployeeForm(form, canManageBranches) {
  if (!form.firstName?.trim()) return 'First name is required.'
  if (!form.lastName?.trim()) return 'Last name is required.'
  if (!form.employeeCode?.trim()) return 'Employee code is required.'
  if (canManageBranches && !form.branchId) return 'Please select a branch for this employee.'
  return null
}

// Leave Config Fields — used in both the Leaves tab (edit) and inline in the add form
function LeaveConfigFields({ form, setField }) {
  const cfg     = form.leaveConfig || {}
  const empType = form.employment?.type || ''
  const leaveType = empType === 'regular_without_leaves' ? 'without_leaves'
                  : empType === 'regular_with_leaves'    ? 'with_leaves'
                  : cfg.leaveType || 'with_leaves'
  const hasSl      = cfg.hasSl      !== false
  const hasVl      = cfg.hasVl      !== false

  if (leaveType === 'without_leaves') {
    return <p className="text-sm text-navy-400 py-2">This employee type has no leave access.</p>
  }

  return (
    <div className="space-y-4">
      {true && (
        <div className="grid grid-cols-2 gap-4">
          {/* Sick Leave */}
          <div className="bg-navy-800 rounded-md border border-navy-500/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-navy-100">Sick Leave</span>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasSl}
                  onChange={e => setField('leaveConfig.hasSl', e.target.checked)}
                  className="accent-accent"
                />
                <span className="text-xs text-navy-300">Enabled</span>
              </label>
            </div>
            {hasSl && (
              <div>
                <p className="label-caps mb-1">SL Quota (days/year)</p>
                <input
                  type="number" min="0"
                  className="field-base w-full text-xs"
                  placeholder="Blank = company default (5)"
                  value={cfg.slQuota ?? ''}
                  onChange={e => setField('leaveConfig.slQuota', e.target.value !== '' ? parseInt(e.target.value) : null)}
                />
              </div>
            )}
          </div>

          {/* Vacation Leave */}
          <div className="bg-navy-800 rounded-md border border-navy-500/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-navy-100">Vacation Leave</span>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasVl}
                  onChange={e => setField('leaveConfig.hasVl', e.target.checked)}
                  className="accent-accent"
                />
                <span className="text-xs text-navy-300">Enabled</span>
              </label>
            </div>
            {hasVl && (
              <div>
                <p className="label-caps mb-1">VL Quota (days/year)</p>
                <input
                  type="number" min="0"
                  className="field-base w-full text-xs"
                  placeholder="Blank = company default (5)"
                  value={cfg.vlQuota ?? ''}
                  onChange={e => setField('leaveConfig.vlQuota', e.target.value !== '' ? parseInt(e.target.value) : null)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Face Enrollment Modal
const CDN_WEIGHTS = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights'
const SAMPLES_NEEDED = 5

const STEPS = [
  { label: 'Face forward', hint: 'Look straight at the camera. Keep your face centered and relaxed.' },
  { label: 'Turn slightly left', hint: 'Rotate your head a little to the left. Keep both eyes visible.' },
  { label: 'Turn slightly right', hint: 'Rotate your head a little to the right. Keep both eyes visible.' },
  { label: 'Tilt chin down', hint: 'Lower your chin slightly while keeping your eyes on the camera.' },
  { label: 'Tilt chin up', hint: 'Raise your chin slightly while keeping your eyes on the camera.' },
]

function FaceEnrollModal({ employee, onClose, onDone }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const faceapiRef = useRef(null)

  const [phase, setPhase] = useState('cam-select')
  const [cameras, setCameras] = useState([])
  const [selCam, setSelCam] = useState('')
  const [samples, setSamples] = useState([])
  const [step, setStep] = useState(0)
  const [flash, setFlash] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [faceOk, setFaceOk] = useState(false)
  const [detScore, setDetScore] = useState(0)
  const detLoopRef = useRef(null)

  const getFaceApi = useCallback(async () => {
    if (!faceapiRef.current) {
      const mod = await import('face-api.js')
      faceapiRef.current = mod
    }
    return faceapiRef.current
  }, [])

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase('error')
      setErrMsg('Camera access is only available over HTTPS. Please access this page using a secure connection (https://) to use face enrollment.')
      return
    }
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

  useEffect(() => {
    return () => {
      cancelAnimationFrame(detLoopRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  useEffect(() => {
    if (phase !== 'ready') return
    let alive = true
    let running = false
    const smoothed = { score: 0 }

    const tick = async () => {
      if (!alive || running) return
      running = true
      const video = videoRef.current
      if (video && video.readyState >= 2) {
        const faceapi = await getFaceApi()
        const det = await faceapi.detectSingleFace(
          video,
          new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.35 })
        )
        if (alive) {
          const raw = det?.score ?? 0
          smoothed.score = smoothed.score * 0.6 + raw * 0.4
          setFaceOk(smoothed.score > 0.42)
          setDetScore(smoothed.score)
        }
      }
      running = false
    }

    detLoopRef.current = setInterval(tick, 250)
    return () => { alive = false; clearInterval(detLoopRef.current) }
  }, [getFaceApi, phase])

  const startCamera = async () => {
    setPhase('loading')
    setErrMsg('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access requires a secure connection (HTTPS). Please contact your administrator to enable HTTPS on this server.')
      }
      const faceapi = await getFaceApi()
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(CDN_WEIGHTS),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(CDN_WEIGHTS),
        faceapi.nets.faceRecognitionNet.loadFromUri(CDN_WEIGHTS),
      ])
      const attempts = [
        selCam ? { deviceId: { ideal: selCam }, width: { ideal: 640 }, height: { ideal: 480 } } : null,
        { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        { width: { ideal: 640 }, height: { ideal: 480 } },
        true,
      ].filter(Boolean)
      let stream, lastErr
      for (const constraints of attempts) {
        try { stream = await navigator.mediaDevices.getUserMedia({ video: constraints }); break }
        catch (err) { lastErr = err }
      }
      if (!stream) {
        const msg = lastErr?.name === 'NotAllowedError'
          ? 'Camera access denied. Allow camera permission in browser settings.'
          : lastErr?.name === 'NotFoundError'
          ? 'No camera found. Make sure a webcam is connected.'
          : `Camera error: ${lastErr?.message || 'unknown'}. Try closing other apps using the camera, or check Windows Settings → Privacy → Camera.`
        throw new Error(msg)
      }
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
    if (!navigator.mediaDevices?.getUserMedia) return
    cancelAnimationFrame(detLoopRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    try {
      const attempts = [
        { deviceId: { ideal: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } },
        { width: { ideal: 640 }, height: { ideal: 480 } },
        true,
      ]
      let stream, lastErr
      for (const constraints of attempts) {
        try { stream = await navigator.mediaDevices.getUserMedia({ video: constraints }); break }
        catch (err) { lastErr = err }
      }
      if (!stream) throw lastErr
      streamRef.current = stream
      const video = videoRef.current
      video.srcObject = stream
      await new Promise(res => { video.onloadedmetadata = res })
      video.play()
    } catch (err) {
      setErrMsg(err.message)
    }
  }

  const captureStep = async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return

    const faceapi = await getFaceApi()

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
      <div className="bg-navy-800 border border-navy-500 w-full max-w-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-500 bg-navy-800">
          <div>
            <h3 className="text-sm font-semibold text-navy-50 uppercase tracking-wider">Face Enrollment</h3>
            <p className="text-2xs text-navy-300">{employee.firstName} {employee.lastName}</p>
          </div>
          <button onClick={onClose} className="text-navy-300 hover:text-navy-100 text-2xl leading-none">×</button>
        </div>

        <div className={showVideo ? 'block' : 'hidden'}>
          {(phase === 'ready' || phase === 'done') && (
            <div className="flex items-center gap-2 px-6 pt-5 mb-3">
              {STEPS.map((s, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className={`w-7 h-7 flex items-center justify-center text-2xs border transition-all ${
                    i < progress
                      ? 'bg-signal-success border-signal-success text-white'
                      : i === progress && phase === 'ready'
                      ? 'bg-accent border-accent text-white animate-pulse'
                      : 'bg-navy-600 border-navy-500 text-navy-400'
                  }`}>
                    {i < progress ? 'OK' : i + 1}
                  </div>
                  <span className="text-xs text-navy-400 text-center leading-tight hidden sm:block">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {cameras.length > 1 && (phase === 'ready' || phase === 'done') && (
            <div className="flex items-center gap-2 px-6 mb-2">
              <span className="text-xs text-navy-400 whitespace-nowrap">Camera</span>
              <select
                value={selCam}
                onChange={e => switchCamera(e.target.value)}
                className="field-base flex-1 text-xs"
              >
                {cameras.map((cam, i) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="relative bg-black mx-6 overflow-hidden aspect-video border border-navy-500">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />

            {phase === 'loading' && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3">
                <Spinner size="lg" />
                <p className="text-navy-100 text-sm">Loading AI models...</p>
              </div>
            )}

            {flash && <div className="absolute inset-0 bg-signal-success/40 pointer-events-none" />}

            {phase === 'ready' && (
              <div className={`absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1 text-2xs font-semibold transition-colors duration-300 ${
                detScore >= 0.62 ? 'bg-signal-success text-white' :
                faceOk ? 'bg-signal-warning text-[#151515]' : 'bg-signal-danger text-white'
              }`}>
                {detScore >= 0.62
                  ? `Quality ${Math.round(detScore * 100)}%`
                  : faceOk
                  ? 'Adjust position or lighting'
                  : 'No face detected'}
              </div>
            )}

            {phase === 'done' && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                <div className="w-14 h-14 bg-signal-success flex items-center justify-center text-lg text-white">OK</div>
                <p className="text-white font-semibold text-base">All poses captured</p>
              </div>
            )}
          </div>

          {phase === 'ready' && (
            <div className="mx-6 mt-3 bg-navy-600 border border-navy-500 px-4 py-3 flex items-start gap-3">
              <div>
                <p className="text-xs font-semibold text-navy-100">Step {progress + 1} of {SAMPLES_NEEDED}: {currentStep.label}</p>
                <p className="text-2xs text-navy-300 mt-0.5">{currentStep.hint}</p>
              </div>
            </div>
          )}

          <div className="flex gap-3 px-6 py-5">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            {phase === 'loading' && (
              <div className="flex-1 py-2.5 text-center text-sm text-navy-400">Starting camera...</div>
            )}
            {phase === 'ready' && (
              <Button
                variant="primary"
                className="flex-1"
                onClick={captureStep}
                disabled={detScore < 0.62}
              >
                Capture Pose {progress + 1}/{SAMPLES_NEEDED}
              </Button>
            )}
            {phase === 'done' && (
              <Button variant="primary" className="flex-1" onClick={saveEnrollment}>
                Save Enrollment
              </Button>
            )}
          </div>
        </div>

        {phase === 'cam-select' && (
          <div className="p-6 flex flex-col gap-5">
            <div className="bg-navy-600 border border-navy-500 px-4 py-3 text-xs text-navy-200 leading-relaxed">
              <p className="font-semibold mb-1 uppercase tracking-wide">Before you begin</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Ensure the employee is in front of the camera.</li>
                <li>Use a well-lit environment without strong backlight.</li>
                <li>Remove anything covering the face.</li>
                <li>Capture {SAMPLES_NEEDED} guided poses for high recognition accuracy.</li>
              </ul>
            </div>
            <div>
              <p className="label-caps mb-2">Select Camera</p>
              {cameras.length === 0 ? (
                <p className="text-sm text-navy-400 italic">Detecting cameras...</p>
              ) : (
                <select
                  value={selCam}
                  onChange={e => setSelCam(e.target.value)}
                  className="field-base w-full text-sm"
                >
                  {cameras.map((cam, i) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <Button variant="primary" onClick={startCamera} disabled={!selCam}>
              Start Enrollment
            </Button>
          </div>
        )}

        {phase === 'saving' && (
          <div className="p-10 flex flex-col items-center gap-4 text-navy-300">
            <Spinner size="lg" />
            <p className="text-sm">Saving enrollment data...</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="p-6 flex flex-col items-center gap-4">
            <p className="text-signal-danger text-sm text-center">{errMsg}</p>
            <div className="flex gap-3">
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
              <Button variant="primary" size="sm" onClick={() => { setSamples([]); setStep(0); setPhase('cam-select') }}>
                Try Again
              </Button>
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
  const canManageBranches = ['super_admin', 'client_admin'].includes(user?.role)
  const userBranchId = user?.branchId?._id || user?.branchId || ''

  const [employees, setEmployees] = useState([])
  const [branches, setBranches] = useState([])
  const [depts, setDepts] = useState([])
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [faceEnrollTarget, setFaceEnrollTarget] = useState(null)
  const [reauthOpen, setReauthOpen] = useState(false)
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthError, setReauthError] = useState('')
  const [reauthLoading, setReauthLoading] = useState(false)
  const [pendingSensitiveAction, setPendingSensitiveAction] = useState(null)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [dayOffs, setDayOffs] = useState([])
  const [dayOffForm, setDayOffForm] = useState({ date: '', type: 'full_day', startTime: '', endTime: '', reason: '' })
  const [dayOffError, setDayOffError] = useState('')
  const [dayOffSaving, setDayOffSaving] = useState(false)
  const [modalTab, setModalTab] = useState('profile')

  const [reportsToSearch, setReportsToSearch] = useState('')
  const [reportsToOpen, setReportsToOpen] = useState(false)

  const [pendingDocs, setPendingDocs] = useState([])     // queued for upload on save
  const [deletedDocIds, setDeletedDocIds] = useState([]) // marked for removal on save
  const [docPending, setDocPending] = useState(null)     // file being configured before queueing
  const [docError, setDocError] = useState('')

  const handleDocFileSelect = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!ALLOWED.includes(file.type)) {
      setDocError('Only JPEG, PNG, WebP, and PDF files are allowed.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setDocError('File must be 2 MB or smaller.')
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const base64 = ev.target.result.split(',')[1]
      setDocError('')
      setDocPending({ fileName: file.name, mimeType: file.type, size: file.size, data: base64, category: 'other', label: '' })
    }
    reader.readAsDataURL(file)
  }

  const handleQueueDoc = () => {
    if (!docPending) return
    setPendingDocs(prev => [...prev, { ...docPending }])
    setDocPending(null)
    setDocError('')
  }

  const handleUnqueueDoc = (idx) => {
    setPendingDocs(prev => prev.filter((_, i) => i !== idx))
  }

  const handleMarkDocDelete = (docId) => {
    setDeletedDocIds(prev => prev.includes(docId) ? prev : [...prev, docId])
  }

  const handleDocDownload = async (doc) => {
    try {
      await downloadEmployeeDocument(selectedEmployee._id, doc.id, doc.fileName)
    } catch (err) {
      setDocError(err.message || 'Download failed.')
    }
  }

  const handleAddDayOff = async () => {
    if (!dayOffForm.date) { setDayOffError('Date is required.'); return }
    if (dayOffForm.type === 'custom' && (!dayOffForm.startTime || !dayOffForm.endTime)) {
      setDayOffError('Start and end time are required for custom type.'); return
    }
    setDayOffSaving(true); setDayOffError('')
    try {
      const res = await createEmployeeDayOff(selectedEmployee._id, {
        date:      dayOffForm.date,
        type:      dayOffForm.type,
        startTime: dayOffForm.type === 'custom' ? dayOffForm.startTime : null,
        endTime:   dayOffForm.type === 'custom' ? dayOffForm.endTime   : null,
        reason:    dayOffForm.reason || null,
      })
      setDayOffs(prev => {
        const idx = prev.findIndex(x => x.date === res.data.date)
        if (idx >= 0) { const next = [...prev]; next[idx] = res.data; return next }
        return [...prev, res.data].sort((a, b) => a.date.localeCompare(b.date))
      })
      setDayOffForm({ date: '', type: 'full_day', startTime: '', endTime: '', reason: '' })
    } catch (err) {
      setDayOffError(err.message || 'Failed to save.')
    } finally {
      setDayOffSaving(false)
    }
  }

  const handleRemoveDayOff = async (id) => {
    try {
      await deleteEmployeeDayOff(selectedEmployee._id, id)
      setDayOffs(prev => prev.filter(x => x.id !== id))
    } catch (err) {
      setDayOffError(err.message || 'Failed to delete.')
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [eRes, bRes, dRes, sRes] = await Promise.all([
        getEmployees(), getBranches(), getDepartments(), getSchedules()
      ])
      setEmployees(eRes?.data || [])
      setBranches(bRes?.data || [])
      setDepts(dRes?.data || [])
      setSchedules(sRes?.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedEmployee?._id) return
    const next = employees.find((employee) => employee._id === selectedEmployee._id)
    if (next) setSelectedEmployee(next)
  }, [employees, selectedEmployee?._id])

  useEffect(() => {
    if (!selectedEmployee?._id) { setDayOffs([]); return }
    getEmployeeDayOffs(selectedEmployee._id).then(r => setDayOffs(r?.data || [])).catch(() => setDayOffs([]))
    setDayOffForm({ date: '', type: 'full_day', startTime: '', endTime: '', reason: '' })
    setDayOffError('')
  }, [selectedEmployee?._id])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditTarget(null)
    setForm(canManageBranches ? EMPTY_FORM : { ...EMPTY_FORM, branchId: userBranchId })
    setError('')
    setReportsToSearch('')
    setReportsToOpen(false)
    setPendingDocs([])
    setDeletedDocIds([])
    setDocPending(null)
    setDocError('')
    setModalTab('profile')
    setShowModal(true)
  }

  const openEdit = (emp) => {
    setEditTarget(emp._id)
    setForm(deepMerge(EMPTY_FORM, emp))
    setError('')
    setReportsToSearch('')
    setReportsToOpen(false)
    setPendingDocs([])
    setDeletedDocIds([])
    setDocPending(null)
    setDocError('')
    setModalTab('profile')
    setDayOffForm({ date: '', type: 'full_day', startTime: '', endTime: '', reason: '' })
    setDayOffError('')
    getEmployeeDayOffs(emp._id).then(r => setDayOffs(r?.data || [])).catch(() => setDayOffs([]))
    setShowModal(true)
  }

  const promptSensitiveAuth = (action) => {
    setPendingSensitiveAction(action)
    setReauthPassword('')
    setReauthError('')
    setReauthOpen(true)
  }

  const requestEdit = (employee) => {
    if (hasFreshSensitiveAuth()) {
      openEdit(employee)
      return
    }
    promptSensitiveAuth({ type: 'edit', employee })
  }

  const performDelete = async (id) => {
    await deleteEmployee(id)
    load()
  }

  const requestDelete = (id) => {
    if (hasFreshSensitiveAuth()) {
      if (!window.confirm('Delete this employee?')) return
      performDelete(id)
      return
    }
    promptSensitiveAuth({ type: 'delete', employeeId: id })
  }

  const requestFaceEnroll = (employee) => {
    if (hasFreshSensitiveAuth()) {
      setFaceEnrollTarget(employee)
      return
    }
    promptSensitiveAuth({ type: 'face_enroll', employee })
  }

  const requestView = (employee) => {
    if (hasFreshSensitiveAuth()) {
      setSelectedEmployee(employee)
      return
    }
    promptSensitiveAuth({ type: 'view', employee })
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

      if (action?.type === 'edit' && action.employee) {
        openEdit(action.employee)
      }
      if (action?.type === 'delete' && action.employeeId) {
        await performDelete(action.employeeId)
      }
      if (action?.type === 'view' && action.employee) {
        setSelectedEmployee(action.employee)
      }
      if (action?.type === 'face_enroll' && action.employee) {
        setFaceEnrollTarget(action.employee)
      }
    } catch (err) {
      setReauthError(err.message || 'Password verification failed')
    } finally {
      setReauthLoading(false)
    }
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
    const validationError = validateEmployeeForm(form, canManageBranches)
    if (validationError) { setError(validationError); return }
    setError('')
    setSaving(true)
    try {
      const payload = canManageBranches ? form : { ...form, branchId: userBranchId }
      let empId = editTarget
      if (editTarget) {
        await updateEmployee(editTarget, payload)
      } else {
        const res = await createEmployee(payload)
        empId = res?.data?._id
      }

      // Upload queued docs
      if (empId && pendingDocs.length > 0) {
        for (const doc of pendingDocs) {
          await uploadEmployeeDocument(empId, doc)
        }
      }

      // Process deletions
      if (empId && deletedDocIds.length > 0) {
        for (const docId of deletedDocIds) {
          await deleteEmployeeDocument(empId, docId)
        }
      }

      setShowModal(false)
      load()
    } catch (err) {
      setError(formatEmployeeError(err.message))
    } finally {
      setSaving(false)
    }
  }

  const branchById = new Map(branches.map((branch) => [branch._id, branch]))
  const deptById = new Map(depts.map((dept) => [dept._id, dept]))
  const scheduleById = new Map(schedules.map((schedule) => [schedule._id, schedule]))
  const scopedEmployees = canManageBranches
    ? employees
    : employees.filter((employee) => (employee.branchId?._id || employee.branchId || '') === userBranchId)

  const filtered = scopedEmployees.filter(e => {
    const q = search.toLowerCase()
    const branchId = e.branchId?._id || e.branchId || ''
    const status = e.employment?.status || 'unknown'

    const matchesSearch = (
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
      e.employeeCode?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q) ||
      e.employment?.position?.toLowerCase().includes(q)
    )
    const matchesBranch = canManageBranches
      ? (branchFilter === 'all' || branchId === branchFilter)
      : (!userBranchId || branchId === userBranchId)
    const matchesStatus = statusFilter === 'all' || status === statusFilter

    return matchesSearch && matchesBranch && matchesStatus
  })

  const sortedEmployees = [...filtered].sort((left, right) => {
    const leftBranch = branchById.get(left.branchId?._id || left.branchId)?.name || 'Unassigned Branch'
    const rightBranch = branchById.get(right.branchId?._id || right.branchId)?.name || 'Unassigned Branch'
    if (leftBranch !== rightBranch) return leftBranch.localeCompare(rightBranch)
    const leftName = `${left.lastName || ''} ${left.firstName || ''}`.trim()
    const rightName = `${right.lastName || ''} ${right.firstName || ''}`.trim()
    return leftName.localeCompare(rightName)
  })

  const groupedEmployees = sortedEmployees.reduce((acc, employee) => {
    const branchName = branchById.get(employee.branchId?._id || employee.branchId)?.name || 'Unassigned Branch'
    if (!acc[branchName]) acc[branchName] = []
    acc[branchName].push(employee)
    return acc
  }, {})

  const totalEmployees = scopedEmployees.length
  const activeEmployees = scopedEmployees.filter((employee) => employee.employment?.status === 'active').length
  const enrolledEmployees = scopedEmployees.filter((employee) => hasFaceEnrollment(employee)).length
  const incompleteProfiles = scopedEmployees.filter((employee) => !employee.email || !employee.scheduleId).length
  const columnCount = canEdit ? 8 : 7

  const formatDateValue = (value) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleDateString()
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-navy-500 bg-navy-800">
        <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">Employees</h1>
        {canEdit && (
          <Button variant="primary" size="md" onClick={openCreate}>+ Add Employee</Button>
        )}
      </div>

      <div className="px-6 py-4 border-b border-navy-500 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-md border border-navy-500 bg-navy-700 px-4 py-3">
            <p className="label-caps">Total Employees</p>
            <p className="mt-1 text-base font-bold text-navy-50">{totalEmployees}</p>
          </div>
          <div className="rounded-md border border-navy-500 bg-navy-700 px-4 py-3">
            <p className="label-caps">Active</p>
            <p className="mt-1 text-base font-bold text-navy-50">{activeEmployees}</p>
          </div>
          <div className="rounded-md border border-navy-500 bg-navy-700 px-4 py-3">
            <p className="label-caps">Face Enrolled</p>
            <p className="mt-1 text-base font-bold text-navy-50">{enrolledEmployees}</p>
          </div>
          <div className="rounded-md border border-navy-500 bg-navy-700 px-4 py-3">
            <p className="label-caps">Needs Attention</p>
            <p className="mt-1 text-base font-bold text-navy-50">{incompleteProfiles}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-sm">
            <p className="label-caps mb-1">Search</p>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, code, email, or position..."
              className="field-base w-full text-xs"
            />
          </div>
          {canManageBranches && (
            <div className="w-full sm:w-48">
              <p className="label-caps mb-1">Branch</p>
              <select className="field-base text-xs" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                <option value="all">All branches</option>
                {branches.map((branch) => (
                  <option key={branch._id} value={branch._id}>{branch.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="w-full sm:w-40">
            <p className="label-caps mb-1">Status</p>
            <select className="field-base text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="resigned">Resigned</option>
              <option value="terminated">Terminated</option>
            </select>
          </div>
          <div className="pb-2 text-xs text-navy-300">Showing {sortedEmployees.length} of {totalEmployees}</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
        ) : (
          <div className="table-shell overflow-x-auto">
            <table className="table-base">
              <thead className="sticky top-0 z-10">
                <tr className="table-head-row">
                  {['Code', 'Name', 'Email', 'Position', 'Branch', 'Status', 'Face', canEdit ? 'Actions' : ''].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedEmployees.length === 0 ? (
                  <tr><td colSpan={columnCount} className="table-empty">No employees found</td></tr>
                ) : Object.entries(groupedEmployees).map(([branchName, group]) => (
                  <Fragment key={branchName}>
                    <tr className="bg-navy-800/80 border-b border-navy-500/30">
                      <td colSpan={columnCount} className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="label-caps">Branch Group</p>
                            <p className="mt-1 text-sm font-semibold text-navy-100">{branchName}</p>
                          </div>
                          <span className="text-2xs text-navy-300">{group.length} employee{group.length === 1 ? '' : 's'}</span>
                        </div>
                      </td>
                    </tr>
                    {group.map((emp, index) => {
                      const branch = branchById.get(emp.branchId?._id || emp.branchId)
                      const isEnrolled = hasFaceEnrollment(emp)
                      return (
                        <tr
                          key={emp._id}
                          className={`table-row cursor-pointer ${index % 2 !== 0 ? 'table-row-alt' : ''} ${selectedEmployee?._id === emp._id ? 'bg-accent/10' : ''}`}
                          onClick={() => requestView(emp)}
                        >
                          <td className="px-4 py-2.5 font-mono text-2xs text-navy-300">{emp.employeeCode}</td>
                          <td className="px-4 py-2.5 font-medium text-navy-100">{emp.firstName} {emp.lastName}</td>
                          <td className="px-4 py-2.5 text-navy-300 font-mono">{emp.email || '—'}</td>
                          <td className="px-4 py-2.5 text-navy-300">{emp.employment?.position || '—'}</td>
                          <td className="px-4 py-2.5 text-navy-400">{branch?.name || '—'}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant={STATUS_VARIANT[emp.employment?.status] || 'neutral'}>
                              {emp.employment?.status || 'unknown'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant={isEnrolled ? 'success' : 'warning'}>
                              {isEnrolled ? 'Enrolled' : 'Not Enrolled'}
                            </Badge>
                          </td>
                          {canEdit && (
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <button onClick={(event) => { event.stopPropagation(); requestEdit(emp) }} className="text-2xs text-accent hover:text-accent-200 transition-colors">Edit</button>
                                <button onClick={(event) => { event.stopPropagation(); requestFaceEnroll(emp) }} className="text-2xs text-navy-300 hover:text-navy-100 transition-colors">{isEnrolled ? 'Re-enroll Face' : 'Enroll Face'}</button>
                                <button onClick={(event) => { event.stopPropagation(); requestDelete(emp._id) }} className="text-2xs text-signal-danger/70 hover:text-signal-danger transition-colors">Delete</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedEmployee && (
          <div className="mt-5 table-shell p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="label-caps">Employee Profile</p>
                <p className="mt-1 text-sm font-semibold text-navy-100">
                  {selectedEmployee.firstName} {selectedEmployee.lastName}
                </p>
                <p className="text-2xs text-navy-300 mt-1">{selectedEmployee.employeeCode || '—'}</p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => requestEdit(selectedEmployee)}>Edit Employee</Button>
                  <Button size="sm" variant="danger" onClick={() => requestDelete(selectedEmployee._id)}>Delete Employee</Button>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <div className="rounded-md border border-navy-500 bg-navy-700/40 px-4 py-3">
                <p className="label-caps">Personal</p>
                <p className="mt-2 text-xs text-navy-100">Name: {selectedEmployee.firstName} {selectedEmployee.middleName || ''} {selectedEmployee.lastName}</p>
                <p className="mt-1 text-xs text-navy-300">Birth Date: {formatDateValue(selectedEmployee.dateOfBirth)}</p>
                <p className="mt-1 text-xs text-navy-300">Gender: {selectedEmployee.gender || '—'}</p>
              </div>

              <div className="rounded-md border border-navy-500 bg-navy-700/40 px-4 py-3">
                <p className="label-caps">Contact</p>
                <p className="mt-2 text-xs text-navy-100 break-all">Email: {selectedEmployee.email || '—'}</p>
                <p className="mt-1 text-xs text-navy-300">Mobile: {selectedEmployee.contactNumber || '—'}</p>
                <p className="mt-1 text-xs text-navy-300">Address: {selectedEmployee.address || '—'}</p>
              </div>

              <div className="rounded-md border border-navy-500 bg-navy-700/40 px-4 py-3">
                <p className="label-caps">Employment</p>
                <p className="mt-2 text-xs text-navy-100">Position: {selectedEmployee.employment?.position || '—'}</p>
                <p className="mt-1 text-xs text-navy-300">Status: {selectedEmployee.employment?.status || '—'}</p>
                <p className="mt-1 text-xs text-navy-300">Type: {EMP_TYPE_LABEL[selectedEmployee.employment?.type] || selectedEmployee.employment?.type || '—'}</p>
                <p className="mt-1 text-xs text-navy-300">Date Hired: {formatDateValue(selectedEmployee.employment?.dateHired)}</p>
              </div>

              <div className="rounded-md border border-navy-500 bg-navy-700/40 px-4 py-3">
                <p className="label-caps">Org Assignment</p>
                <p className="mt-2 text-xs text-navy-100">Branch: {branchById.get(selectedEmployee.branchId?._id || selectedEmployee.branchId)?.name || '—'}</p>
                <p className="mt-1 text-xs text-navy-300">Department: {deptById.get(selectedEmployee.departmentId?._id || selectedEmployee.departmentId)?.name || '—'}</p>
                <p className="mt-1 text-xs text-navy-300">Schedule: {scheduleById.get(selectedEmployee.scheduleId?._id || selectedEmployee.scheduleId)?.name || '—'}</p>
                {(() => {
                  const sup = employees.find(e => e._id === selectedEmployee.reportsToId)
                  return <p className="mt-1 text-xs text-navy-300">Reports To: {sup ? `${sup.firstName} ${sup.lastName}` : '—'}</p>
                })()}
              </div>

              <div className="rounded-md border border-navy-500 bg-navy-700/40 px-4 py-3">
                <p className="label-caps">Government IDs</p>
                <p className="mt-2 text-xs text-navy-100">TIN: {selectedEmployee.govIds?.tin || '—'}</p>
                <p className="mt-1 text-xs text-navy-300">SSS: {selectedEmployee.govIds?.sss || '—'}</p>
                <p className="mt-1 text-xs text-navy-300">PhilHealth: {selectedEmployee.govIds?.philHealth || '—'}</p>
                <p className="mt-1 text-xs text-navy-300">Pag-IBIG: {selectedEmployee.govIds?.pagIbig || '—'}</p>
              </div>

              <div className="rounded-md border border-navy-500 bg-navy-700/40 px-4 py-3">
                <p className="label-caps">Bank</p>
                <p className="mt-2 text-xs text-navy-100">Bank: {selectedEmployee.bank?.bankName || '—'}</p>
                <p className="mt-1 text-xs text-navy-300">Account #: {selectedEmployee.bank?.accountNumber || '—'}</p>
              </div>

              <div className="rounded-md border border-navy-500 bg-navy-700/40 px-4 py-3">
                <p className="label-caps">Documents</p>
                {(!selectedEmployee.documents?.length) ? (
                  <p className="mt-2 text-2xs text-navy-400">No documents uploaded.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedEmployee.documents.map(doc => {
                      const CAT = { tin: 'TIN', sss: 'SSS', philhealth: 'PhilHealth', pagibig: 'Pag-IBIG', bank: 'Bank', employment: 'Employment', other: 'Other' }
                      const kb = doc.size ? `${(doc.size / 1024).toFixed(0)} KB` : ''
                      return (
                        <div key={doc.id} className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-2xs font-medium text-navy-100 truncate">{doc.label || doc.fileName}</p>
                            <p className="text-2xs text-navy-400">{CAT[doc.category] || doc.category}{kb ? ` · ${kb}` : ''}</p>
                          </div>
                          <Button variant="ghost" size="xs" onClick={() => handleDocDownload(doc)}>Download</Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-md border border-navy-500 bg-navy-700/40 px-4 py-3 md:col-span-2 xl:col-span-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="label-caps">Day Offs</p>
                  {canEdit && (
                    <button type="button"
                      onClick={() => { requestEdit(selectedEmployee); setTimeout(() => setModalTab('dayoffs'), 50) }}
                      className="text-2xs text-accent hover:text-accent-200 transition-colors">
                      Manage →
                    </button>
                  )}
                </div>
                {dayOffs.length === 0 ? (
                  <p className="text-2xs text-navy-400">No day offs scheduled.</p>
                ) : (
                  <div className="space-y-1.5">
                    {dayOffs.map(d => {
                      const TYPE_LABELS = { full_day: 'Full Day', half_day_am: 'Half Day AM', half_day_pm: 'Half Day PM', custom: 'Custom' }
                      const detail = d.type === 'custom' ? ` (${d.startTime}–${d.endTime})` : ''
                      return (
                        <div key={d.id} className="flex items-center gap-2 text-2xs">
                          <span className="font-mono text-navy-200">{d.date}</span>
                          <span className="text-accent">{TYPE_LABELS[d.type] || d.type}{detail}</span>
                          {d.reason && <span className="text-navy-400 truncate">— {d.reason}</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-md border border-navy-500 bg-navy-700/40 px-4 py-3">
                <p className="label-caps">Face Enrollment</p>
                <p className="mt-2 text-xs text-navy-100">Status: {hasFaceEnrollment(selectedEmployee) ? 'Enrolled' : 'Not Enrolled'}</p>
                <p className="mt-1 text-xs text-navy-300">
                  {hasFaceEnrollment(selectedEmployee) ? 'Face data is available for kiosk recognition.' : 'No face data saved yet.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <Modal
          title={editTarget ? 'Edit Employee' : 'Add Employee'}
          width="max-w-4xl"
          onClose={() => setShowModal(false)}
          onConfirm={modalTab === 'dayoffs' ? () => setShowModal(false) : handleSave}
          confirmLabel={modalTab === 'dayoffs' ? 'Done' : 'Save Changes'}
          loading={saving}
        >
          <div className="space-y-1">
            {editTarget && (
              <div className="flex gap-0 mb-5 -mx-6 px-6 border-b border-navy-500">
                {[
                  { key: 'profile',   label: 'Profile'   },
                  { key: 'dayoffs',   label: 'Day Offs'  },
                  { key: 'leaves',    label: 'Leaves'    },
                  { key: 'documents', label: 'Documents' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setModalTab(key)}
                    className={`px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                      modalTab === key
                        ? 'text-accent border-accent'
                        : 'text-navy-400 border-transparent hover:text-navy-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <p className="mb-4 text-2xs text-signal-danger px-3 py-2 bg-signal-danger/8 border border-signal-danger/25 rounded-md">
                {error}
              </p>
            )}

            {(!editTarget || modalTab === 'profile') && (<>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Employee Code *"><input className="field-base" value={form.employeeCode} onChange={e => setField('employeeCode', e.target.value)} /></Field>
              <Field label="First Name *"><input className="field-base" value={form.firstName} onChange={e => setField('firstName', e.target.value)} /></Field>
              <Field label="Middle Name"><input className="field-base" value={form.middleName} onChange={e => setField('middleName', e.target.value)} /></Field>
              <Field label="Last Name *"><input className="field-base" value={form.lastName} onChange={e => setField('lastName', e.target.value)} /></Field>
              <Field label="Email"><input type="email" className="field-base" value={form.email} onChange={e => setField('email', e.target.value)} /></Field>
              <Field label="Contact Number"><input className="field-base" value={form.contactNumber} onChange={e => setField('contactNumber', e.target.value)} /></Field>
              <Field label="Date of Birth"><input type="date" className="field-base" value={form.dateOfBirth?.slice(0, 10) || ''} onChange={e => setField('dateOfBirth', e.target.value)} /></Field>
              <Field label="Gender">
                <select className="field-base" value={form.gender} onChange={e => setField('gender', e.target.value)}>
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>
            </div>

            <SectionHeading>Employment Details</SectionHeading>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Branch *">
                {canManageBranches ? (
                  <select className="field-base" value={form.branchId} onChange={e => setField('branchId', e.target.value)}>
                    <option value="">Select branch...</option>
                    {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                  </select>
                ) : (
                  <input
                    className="field-base"
                    value={branchById.get(userBranchId)?.name || 'Assigned Branch'}
                    disabled
                  />
                )}
              </Field>
              <Field label="Department">
                <select className="field-base" value={form.departmentId} onChange={e => setField('departmentId', e.target.value)}>
                  <option value="">Select dept...</option>
                  {depts.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label="Schedule">
                <select className="field-base" value={form.scheduleId || ''} onChange={e => setField('scheduleId', e.target.value)}>
                  <option value="">Default / No schedule</option>
                  {schedules.map(s => <option key={s._id} value={s._id}>{s.name} ({s.code})</option>)}
                </select>
              </Field>
              <Field label="Position"><input className="field-base" value={form.employment?.position || ''} onChange={e => setField('employment.position', e.target.value)} /></Field>
              <Field label="Status">
                <select className="field-base" value={form.employment?.status || 'active'} onChange={e => setField('employment.status', e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="resigned">Resigned</option>
                  <option value="terminated">Terminated</option>
                </select>
              </Field>
              <Field label="Employment Type">
                <select className="field-base" value={form.employment?.type || 'regular_with_leaves'} onChange={e => {
                  const type = e.target.value
                  setForm(prev => {
                    const updates = { ...prev, employment: { ...prev.employment, type } }
                    if (type === 'regular_with_leaves')    updates.leaveConfig = { ...prev.leaveConfig, leaveType: 'with_leaves' }
                    else if (type === 'regular_without_leaves') updates.leaveConfig = { ...prev.leaveConfig, leaveType: 'without_leaves' }
                    return updates
                  })
                }}>
                  <option value="regular_with_leaves">Regular with Leaves</option>
                  <option value="regular_without_leaves">Regular without Leaves</option>
                  <option value="probationary">Probationary</option>
                  <option value="contractual">Contractual</option>
                  <option value="part_time">Part-time</option>
                </select>
              </Field>
              <Field label="Date Hired"><input type="date" className="field-base" value={form.employment?.dateHired?.slice(0, 10) || ''} onChange={e => setField('employment.dateHired', e.target.value)} /></Field>
              <Field label="Reports To">
                {(() => {
                  const selected = employees.find(e => e._id === form.reportsToId)
                  const candidates = employees
                    .filter(e => e._id !== editTarget)
                    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
                  const q = reportsToSearch.toLowerCase()
                  const filtered = q
                    ? candidates.filter(e =>
                        `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
                        e.employment?.position?.toLowerCase().includes(q) ||
                        e.employeeCode?.toLowerCase().includes(q)
                      )
                    : candidates
                  return (
                    <div className="relative">
                      {selected && !reportsToOpen ? (
                        <div className="field-base flex items-center justify-between gap-2 cursor-pointer"
                          onClick={() => { setReportsToOpen(true); setReportsToSearch('') }}>
                          <span className="text-navy-100 text-xs truncate">
                            {selected.firstName} {selected.lastName}{selected.employment?.position ? ` — ${selected.employment.position}` : ''}
                          </span>
                          <button type="button" onClick={(ev) => { ev.stopPropagation(); setField('reportsToId', ''); setReportsToOpen(false) }}
                            className="text-navy-400 hover:text-signal-danger text-sm leading-none shrink-0">×</button>
                        </div>
                      ) : (
                        <input
                          className="field-base w-full"
                          placeholder="Search by name, position, or code..."
                          value={reportsToSearch}
                          autoFocus={reportsToOpen}
                          onChange={e => { setReportsToSearch(e.target.value); setReportsToOpen(true) }}
                          onFocus={() => setReportsToOpen(true)}
                          onBlur={() => setTimeout(() => setReportsToOpen(false), 150)}
                        />
                      )}
                      {reportsToOpen && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-navy-700 border border-navy-500 rounded-md shadow-lg max-h-48 overflow-y-auto">
                          <div
                            className="px-3 py-2 text-xs text-navy-400 hover:bg-navy-600 cursor-pointer"
                            onMouseDown={() => { setField('reportsToId', ''); setReportsToOpen(false); setReportsToSearch('') }}
                          >
                            None / Direct to management
                          </div>
                          {filtered.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-navy-500">No employees found</div>
                          ) : filtered.map(e => (
                            <div
                              key={e._id}
                              className="px-3 py-2 text-xs text-navy-100 hover:bg-navy-600 cursor-pointer"
                              onMouseDown={() => { setField('reportsToId', e._id); setReportsToOpen(false); setReportsToSearch('') }}
                            >
                              {e.firstName} {e.lastName}
                              {e.employment?.position && <span className="text-navy-400"> — {e.employment.position}</span>}
                              <span className="text-navy-500 ml-1 font-mono text-2xs">{e.employeeCode}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </Field>
            </div>

            {!editTarget && <LeaveConfigFields form={form} setField={setField} />}

            <SectionHeading>Government IDs</SectionHeading>
            <div className="grid grid-cols-2 gap-4">
              <Field label="TIN"><input className="field-base" value={form.govIds?.tin || ''} onChange={e => setField('govIds.tin', e.target.value)} /></Field>
              <Field label="SSS"><input className="field-base" value={form.govIds?.sss || ''} onChange={e => setField('govIds.sss', e.target.value)} /></Field>
              <Field label="PhilHealth"><input className="field-base" value={form.govIds?.philHealth || ''} onChange={e => setField('govIds.philHealth', e.target.value)} /></Field>
              <Field label="Pag-IBIG"><input className="field-base" value={form.govIds?.pagIbig || ''} onChange={e => setField('govIds.pagIbig', e.target.value)} /></Field>
            </div>

            <SectionHeading>Bank Details</SectionHeading>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bank Name"><input className="field-base" value={form.bank?.bankName || ''} onChange={e => setField('bank.bankName', e.target.value)} /></Field>
              <Field label="Account Number"><input className="field-base" value={form.bank?.accountNumber || ''} onChange={e => setField('bank.accountNumber', e.target.value)} /></Field>
            </div>
            </>)}

            {editTarget && modalTab === 'dayoffs' && (
              <div className="space-y-3">
                {dayOffError && (
                  <p className="text-2xs text-signal-danger px-3 py-2 bg-signal-danger/8 border border-signal-danger/25 rounded-md">{dayOffError}</p>
                )}
                {dayOffs.length > 0 ? (
                  <div className="divide-y divide-navy-500/30 rounded-md border border-navy-500 overflow-hidden">
                    {dayOffs.map(d => {
                      const TYPE_LABELS = { full_day: 'Full Day', half_day_am: 'Half Day AM', half_day_pm: 'Half Day PM', custom: 'Custom' }
                      const detail = d.type === 'custom' ? ` (${d.startTime}–${d.endTime})` : ''
                      return (
                        <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 bg-navy-800/40 text-xs">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-navy-200 shrink-0">{d.date}</span>
                            <span className="text-accent font-medium">{TYPE_LABELS[d.type] || d.type}{detail}</span>
                            {d.reason && <span className="text-navy-400 truncate">— {d.reason}</span>}
                          </div>
                          <button type="button" onClick={() => handleRemoveDayOff(d.id)}
                            className="text-2xs text-signal-danger/60 hover:text-signal-danger transition-colors shrink-0">
                            Remove
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-2xs text-navy-400 py-2">No day offs scheduled.</p>
                )}
                <div className="rounded-md border border-navy-500/60 bg-navy-800/40 px-4 py-3 space-y-3">
                  <p className="label-caps text-navy-300">Add Day Off</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                    <div>
                      <p className="label-caps mb-1">Date *</p>
                      <input type="date" className="field-base text-xs"
                        value={dayOffForm.date} onChange={e => setDayOffForm(p => ({ ...p, date: e.target.value }))} />
                    </div>
                    <div>
                      <p className="label-caps mb-1">Type</p>
                      <select className="field-base text-xs" value={dayOffForm.type}
                        onChange={e => setDayOffForm(p => ({ ...p, type: e.target.value, startTime: '', endTime: '' }))}>
                        <option value="full_day">Full Day</option>
                        <option value="half_day_am">Half Day AM</option>
                        <option value="half_day_pm">Half Day PM</option>
                        <option value="custom">Custom Time</option>
                      </select>
                    </div>
                    {dayOffForm.type === 'custom' ? (
                      <>
                        <div>
                          <p className="label-caps mb-1">Off From</p>
                          <input type="time" className="field-base text-xs"
                            value={dayOffForm.startTime} onChange={e => setDayOffForm(p => ({ ...p, startTime: e.target.value }))} />
                        </div>
                        <div>
                          <p className="label-caps mb-1">Off Until</p>
                          <input type="time" className="field-base text-xs"
                            value={dayOffForm.endTime} onChange={e => setDayOffForm(p => ({ ...p, endTime: e.target.value }))} />
                        </div>
                      </>
                    ) : (
                      <div className="md:col-span-2">
                        <p className="label-caps mb-1">Reason (optional)</p>
                        <input className="field-base text-xs" placeholder="e.g. Rotating rest day"
                          value={dayOffForm.reason} onChange={e => setDayOffForm(p => ({ ...p, reason: e.target.value }))} />
                      </div>
                    )}
                  </div>
                  {dayOffForm.type === 'custom' && (
                    <div>
                      <p className="label-caps mb-1">Reason (optional)</p>
                      <input className="field-base text-xs" placeholder="e.g. Medical appointment"
                        value={dayOffForm.reason} onChange={e => setDayOffForm(p => ({ ...p, reason: e.target.value }))} />
                    </div>
                  )}
                  <Button type="button" variant="secondary" size="sm"
                    onClick={handleAddDayOff} loading={dayOffSaving}>
                    + Add Day Off
                  </Button>
                </div>
              </div>
            )}

            {editTarget && modalTab === 'leaves' && (
              <LeaveConfigFields form={form} setField={setField} />
            )}

            {(!editTarget || modalTab === 'documents') && (<>
            <SectionHeading>Documents</SectionHeading>
            {docError && (
              <p className="mb-2 text-2xs text-signal-danger px-3 py-2 bg-signal-danger/8 border border-signal-danger/25 rounded-md">{docError}</p>
            )}

            {/* Existing docs (edit only) */}
            {editTarget && (() => {
              const existing = employees.find(e => e._id === editTarget)?.documents || []
              const visible = existing.filter(d => !deletedDocIds.includes(d.id))
              return visible.length > 0 && (
                <div className="mb-3 divide-y divide-navy-500/30 rounded-md border border-navy-500 overflow-hidden">
                  {visible.map(doc => {
                    const catLabel = DOC_CATEGORIES.find(c => c.value === doc.category)?.label || doc.category
                    const kb = doc.size ? `${(doc.size / 1024).toFixed(0)} KB` : ''
                    return (
                      <div key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-navy-800/50">
                        <div className="min-w-0">
                          <p className="text-xs text-navy-100 truncate">{doc.label || doc.fileName}</p>
                          <p className="text-2xs text-navy-400">{catLabel}{kb ? ` · ${kb}` : ''}</p>
                        </div>
                        <Button type="button" variant="danger" size="xs" onClick={() => handleMarkDocDelete(doc.id)}>Remove</Button>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* Queued new docs */}
            {pendingDocs.length > 0 && (
              <div className="mb-3 divide-y divide-navy-500/30 rounded-md border border-accent/30 overflow-hidden">
                {pendingDocs.map((doc, idx) => {
                  const catLabel = DOC_CATEGORIES.find(c => c.value === doc.category)?.label || doc.category
                  const kb = doc.size ? `${(doc.size / 1024).toFixed(0)} KB` : ''
                  return (
                    <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2 bg-navy-800/50">
                      <div className="min-w-0">
                        <p className="text-xs text-navy-100 truncate">{doc.label || doc.fileName}</p>
                        <p className="text-2xs text-accent/70">{catLabel}{kb ? ` · ${kb}` : ''} · pending</p>
                      </div>
                      <Button type="button" variant="danger" size="xs" onClick={() => handleUnqueueDoc(idx)}>Remove</Button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* File picker / category form */}
            {docPending ? (
              <div className="rounded-md border border-navy-500 bg-navy-800/60 px-3 py-3 space-y-2">
                <p className="text-2xs text-navy-100 truncate font-medium">{docPending.fileName}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Category">
                    <select className="field-base" value={docPending.category} onChange={e => setDocPending(p => ({ ...p, category: e.target.value }))}>
                      {DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Label (optional)">
                    <input className="field-base" placeholder="e.g. TIN Card front" value={docPending.label} onChange={e => setDocPending(p => ({ ...p, label: e.target.value }))} />
                  </Field>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="blue" size="sm" onClick={handleQueueDoc}>Add to Queue</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => { setDocPending(null); setDocError('') }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <label className="flex items-center gap-2 w-fit cursor-pointer text-2xs text-accent hover:text-accent-400 transition-colors">
                <span>+ Attach file</span>
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleDocFileSelect} />
              </label>
            )}
            </>)}
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
            <div>
              <p className="label-caps mb-1">Password</p>
              <input
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
                className="field-base"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

