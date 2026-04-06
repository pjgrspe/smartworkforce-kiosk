/**
 * Kiosk Page — In-browser facial recognition for Time In / Out / Break.
 *
 * Flow:
 *  1. First load → prompt for Tenant Code → save to localStorage
 *  2. Load face-api.js models from CDN (cached thereafter)
 *  3. Load employee face descriptors from /api/kiosk/employees?tenant=CODE
 *  4. Build FaceMatcher — match detected faces in real-time
 *  5. Once a face is confirmed (8 consecutive matching frames) → show name + punch buttons
 *  6. Employee taps punch type → POST /api/kiosk/punch → show success animation
 *
 * face-api.js model weights are loaded from jsDelivr CDN.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ThemeToggle from '../components/ui/ThemeToggle'

// ── Constants ─────────────────────────────────────────────────────────────────
// VITE_MODEL_URL lets the kiosk-service point to locally cached model weights
// so the kiosk works offline. Falls back to jsDelivr CDN.
const CDN_WEIGHTS     = import.meta.env.VITE_MODEL_URL || 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights'
const CONFIRM_FRAMES  = 8         // consecutive matching frames required before confirming (~800ms)
const MATCH_THRESHOLD = 0.50      // max Euclidean distance for a valid match
const MARGIN_MIN      = 0.12      // min gap between best and 2nd-best match (ambiguity guard)
const MIN_FACE_SIZE   = 0.15      // face height must be ≥ 15% of video height (too far = unreliable)
const CONF_BUF_SIZE   = 5         // frames to average confidence over for stability
const DETECT_INTERVAL = 80        // ms between detection frames (~12 fps)
const AUTO_RESET_MS   = 15_000    // auto-dismiss confirmed match after 15 s
const SUCCESS_HOLD_MS = 2_000     // success screen display duration (short — next person lines up)

const ATTENDANCE_PUNCHES = [
  { key: 'IN',  label: 'Time In',  bg: 'bg-signal-success hover:opacity-90' },
  { key: 'OUT', label: 'Time Out', bg: 'bg-signal-danger hover:opacity-90'  },
]
const BREAK_PUNCHES = [
  { key: 'BREAK_IN',  label: 'Start Break', bg: 'bg-accent hover:bg-accent-400'       },
  { key: 'BREAK_OUT', label: 'End Break',   bg: 'bg-signal-warning hover:opacity-90'  },
]
const PUNCH_TYPES = [...ATTENDANCE_PUNCHES, ...BREAK_PUNCHES]

const TYPE_COLOR = {
  IN: 'text-signal-success', OUT: 'text-signal-danger',
  BREAK_OUT: 'text-signal-warning', BREAK_IN: 'text-accent-400',
}

// ── API helpers (no JWT — uses tenant code) ───────────────────────────────────
async function kioskFetch(method, path, tenant, body) {
  const url = `/api/kiosk${path}?tenant=${encodeURIComponent(tenant)}`
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify({ tenant, ...body })
  const res = await fetch(url, opts)
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.error || res.statusText)
  }
  return res.json()
}

function normalizeTenantCode(raw) {
  const normalized = String(raw || '').trim().toUpperCase()
  if (normalized === 'APOLLO') return 'DEWEBNET'
  return normalized
}

// ── Clock component ───────────────────────────────────────────────────────────
function Clock() {
  const [t, setT] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="text-right select-none">
      <p className="text-5xl font-bold tabular-nums tracking-tight">
        {t.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </p>
      <p className="text-sm text-navy-300 mt-0.5">
        {t.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  )
}

// ── Setup screen ──────────────────────────────────────────────────────────────
function SetupScreen({ onDone }) {
  const [code, setCode] = useState('')
  const [err,  setErr]  = useState('')
  const [busy, setBusy] = useState(false)

  const verify = async () => {
    const c = code.trim().toUpperCase()
    if (!c) { setErr('Enter your company code'); return }
    setBusy(true); setErr('')
    try {
      await kioskFetch('GET', '/employees', c)
      localStorage.setItem('kiosk_tenant', c)
      onDone(c)
    } catch (err) {
      setErr(err.message || 'Invalid company code')
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-navy-800 border border-navy-500 rounded-xl p-10 shadow-[0_24px_64px_rgba(3,7,13,0.8)] w-[420px] text-navy-50 text-center"
      >
        <h1 className="text-3xl font-bold mb-1 tracking-tight">Aquino Bistro Group Kiosk</h1>
        <p className="text-navy-300 mb-8 text-sm">Enter your company code to start</p>
        {err && <p className="text-signal-danger text-sm mb-4">{err}</p>}
        <input
          autoFocus
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && verify()}
          placeholder="COMPANY"
          className="w-full bg-navy-700 border border-navy-500 rounded-lg px-5 py-4 text-2xl text-center tracking-[0.14em] uppercase mb-5 focus:outline-none focus:border-accent transition"
        />
        <button
          onClick={verify}
          disabled={busy}
          className="w-full bg-accent hover:bg-accent-400 py-4 rounded-lg font-semibold text-lg transition disabled:opacity-50"
        >
          {busy ? 'Verifying...' : 'Start Kiosk'}
        </button>
      </motion.div>
    </div>
  )
}

// ── Loading screen ────────────────────────────────────────────────────────────
function LoadingScreen({ message }) {
  return (
    <div className="min-h-screen bg-navy-900 flex flex-col items-center justify-center text-navy-50 gap-6">
      <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      <p className="text-xl text-navy-300">{message}</p>
    </div>
  )
}

// ── Main kiosk ────────────────────────────────────────────────────────────────
export default function Kiosk() {
  const [tenantCode, setTenantCode] = useState(() => normalizeTenantCode(localStorage.getItem('kiosk_tenant')))
  const faceapiRef = useRef(null)

  const getFaceApi = useCallback(async () => {
    if (!faceapiRef.current) {
      const mod = await import('face-api.js')
      faceapiRef.current = mod
    }
    return faceapiRef.current
  }, [])

  // phase: setup | loading | running | confirmed | punching | success | fail | error | no_face
  const [phase,     setPhase]     = useState('loading')
  const [loadMsg,   setLoadMsg]   = useState('Initializing...')
  const [confirmed, setConfirmed] = useState(null)     // { id, name, confidence }
  const [punchType,  setPunchType]  = useState(null)
  const [punchError, setPunchError] = useState('')
  const [recent,    setRecent]    = useState([])
  const [employees, setEmployees] = useState([])
  const [runtimeVersion, setRuntimeVersion] = useState(null)

  const videoRef      = useRef(null)
  const canvasRef     = useRef(null)
  const rafRef        = useRef(null)
  const matcherRef    = useRef(null)
  const streamRef     = useRef(null)
  const phaseRef      = useRef('loading')
  const matchBufRef   = useRef({ id: null, count: 0 })
  const resetTimerRef = useRef(null)
  const employeesRef  = useRef([])   // mirror of employees state for use in RAF
  const allDescsRef   = useRef({})   // employeeId → Float32Array[] (all enrollment descriptors, for margin check)
  const confBufRef    = useRef([])   // rolling confidence buffer for averaging

  const [cameras,         setCameras]         = useState([])
  const [selCam,          setSelCam]          = useState('')
  const [syncStatus,      setSyncStatus]      = useState(null) // null = unknown, { online, pending }
  const [ambigCandidates, setAmbigCandidates] = useState([])   // [{id, name, dist}] when face is ambiguous
  const ambigBufRef = useRef(0)

  const setPhaseSync = (p) => { phaseRef.current = p; setPhase(p) }

  // On startup: if no tenant code saved, try to auto-fetch it from the kiosk-service
  // config endpoint. This skips the manual setup screen on branch PCs.
  // Falls back to the setup screen if the endpoint isn't available (e.g. central server).
  useEffect(() => {
    const current = localStorage.getItem('kiosk_tenant')
    const normalized = normalizeTenantCode(current)
    if (normalized) {
      // Auto-upgrade legacy tenant codes saved in browser storage.
      if (normalized !== current) {
        localStorage.setItem('kiosk_tenant', normalized)
        setTenantCode(normalized)
      }
      return
    }
    // No saved code — try kiosk-service config endpoint
    fetch('/api/kiosk/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.tenantCode) {
          localStorage.setItem('kiosk_tenant', data.tenantCode)
          setTenantCode(data.tenantCode)
        }
        if (data?.version) setRuntimeVersion(data.version)
      })
      .catch(() => {})
  }, [])

  // ── Enumerate cameras on mount ────────────────────────────────────────────
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

  // ── Kiosk-service sync status via WebSocket ───────────────────────────────
  useEffect(() => {
    // Only connect when running inside the kiosk-service (localhost:4000)
    if (window.location.hostname !== 'localhost') return
    const ws = new WebSocket('ws://localhost:4001')
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'SYNC_STATUS' || msg.type === 'PONG') {
          setSyncStatus({ online: msg.online, pending: msg.pending ?? 0 })
        }
        if (msg.type === 'CACHE_REFRESHED') {
          // New employee data (or updated face encodings) has been pulled from central.
          // Reload the face matcher so newly enrolled employees are detected immediately.
          setReloadKey(k => k + 1)
        }
      } catch (_) {}
    }
    ws.onclose = () => setSyncStatus(s => s ? { ...s, online: false } : { online: false, pending: 0 })
    // Keepalive ping every 30s
    const ping = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'PING' })) }, 30_000)
    return () => { clearInterval(ping); ws.close() }
  }, [])

  // ── Load models + data ─────────────────────────────────────────────────────
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!tenantCode) { setPhaseSync('setup'); return }

    let cancelled = false
    ;(async () => {
      try {
        const faceapi = await getFaceApi()
        setPhaseSync('loading'); setLoadMsg('Loading AI recognition models...')
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(CDN_WEIGHTS),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(CDN_WEIGHTS),
          faceapi.nets.faceRecognitionNet.loadFromUri(CDN_WEIGHTS),
        ])
        if (cancelled) return

        setLoadMsg('Loading employee data...')
        const { data: emps } = await kioskFetch('GET', '/employees', tenantCode)
        if (cancelled) return

        setEmployees(emps)
        employeesRef.current = emps

        const labeled = emps
          .filter(e => e.faceData?.faceApiDescriptors?.length > 0)
          .map(e => {
            // Use ALL enrollment descriptors (not just the mean).
            // FaceMatcher will return the minimum distance to any stored sample,
            // which is more robust to pose variation and different enrollment sessions.
            const floatDescs = e.faceData.faceApiDescriptors.map(d => new Float32Array(d))
            allDescsRef.current[e._id] = floatDescs   // store for margin check
            return new faceapi.LabeledFaceDescriptors(e._id, floatDescs)
          })

        if (labeled.length === 0) {
          setLoadMsg('No enrolled faces found. Go to Employees page and click "Enroll Face" for each employee.')
          setPhaseSync('no_face'); return
        }

        matcherRef.current = new faceapi.FaceMatcher(labeled, MATCH_THRESHOLD)

        setLoadMsg('Starting camera…')
        await startCamera()
        if (cancelled) return

        const { data: logs } = await kioskFetch('GET', '/recent', tenantCode)
        setRecent(logs)
        setPhaseSync('running')
      } catch (err) {
        if (!cancelled) {
          // If cached tenant code became invalid, force setup so user can re-enter code.
          if ((err.message || '').toLowerCase().includes('invalid company code')) {
            localStorage.removeItem('kiosk_tenant')
            setTenantCode('')
            setPhaseSync('setup')
            return
          }
          setLoadMsg('Error: ' + err.message)
          setPhaseSync('error')
        }
      }
    })()
    return () => { cancelled = true }
  }, [getFaceApi, tenantCode, reloadKey])

  // ── Camera ─────────────────────────────────────────────────────────────────
  const startCamera = async (deviceId) => {
    const camId = deviceId || selCam

    // Try progressively looser constraints so finicky laptop cameras still work
    const attempts = [
      camId ? { deviceId: { ideal: camId }, width: { ideal: 640 }, height: { ideal: 480 } } : null,
      { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      { width: { ideal: 640 }, height: { ideal: 480 } },
      true, // bare minimum — any camera
    ].filter(Boolean)

    let stream
    let lastErr
    for (const constraints of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: constraints })
        break
      } catch (err) {
        lastErr = err
      }
    }

    if (!stream) {
      const msg = lastErr?.name === 'NotAllowedError'
        ? 'Camera access denied. Allow camera permission in browser settings.'
        : lastErr?.name === 'NotFoundError'
        ? 'No camera found. Make sure a webcam is connected.'
        : `Camera error: ${lastErr?.message || 'unknown'}. Try: close other apps using the camera, or check Windows camera privacy settings (Settings → Privacy → Camera).`
      throw new Error(msg)
    }

    streamRef.current = stream
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = rej })
    video.play()
  }

  const switchCamera = async (deviceId) => {
    setSelCam(deviceId)
    // Only swap if already running
    if (!['running', 'confirmed'].includes(phaseRef.current)) return
    clearTimeout(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    try {
      await startCamera(deviceId)
      rafRef.current = setTimeout(detectLoop, DETECT_INTERVAL)
    } catch (err) {
      setLoadMsg('Camera switch failed: ' + err.message)
    }
  }

  // Smoothed box state for flicker-free rendering
  const smoothBoxRef  = useRef(null)   // { x, y, w, h, color, miss }
  const renderRafRef  = useRef(null)   // RAF id for the 60fps render loop

  // ── 60fps render loop — only draws, never awaits ──────────────────────────
  const renderLoop = useCallback(() => {
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const s = smoothBoxRef.current
      if (s) {
        ctx.strokeStyle = s.color
        ctx.lineWidth   = 3
        ctx.strokeRect(s.x, s.y, s.w, s.h)
      }
    }
    renderRafRef.current = requestAnimationFrame(renderLoop)
  }, [])

  // Start/stop render loop with running phase
  useEffect(() => {
    if (phase === 'running' || phase === 'confirmed') {
      renderRafRef.current = requestAnimationFrame(renderLoop)
    }
    return () => cancelAnimationFrame(renderRafRef.current)
  }, [phase, renderLoop])

  // ── Detection loop — runs at ~12fps via setTimeout, NO canvas drawing ────────
  const detectLoop = useCallback(async () => {
    const video   = videoRef.current
    const canvas  = canvasRef.current
    const matcher = matcherRef.current

    const schedule = () => { rafRef.current = setTimeout(detectLoop, DETECT_INTERVAL) }

    if (!video || !canvas || !matcher || video.readyState < 2) { schedule(); return }

    const p = phaseRef.current
    if (['punching', 'success', 'fail'].includes(p)) { schedule(); return }
    if (p === 'ambiguous') return

    const faceapi = await getFaceApi()
    const displaySize = { width: video.videoWidth, height: video.videoHeight }
    faceapi.matchDimensions(canvas, displaySize)

    // Higher inputSize → better accuracy on small/angled faces
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.3, inputSize: 512 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor()

    const LERP  = 0.35
    const GRACE = 15

    if (detection) {
      const resized = faceapi.resizeResults(detection, displaySize)
      const box     = resized.detection.box

      // ── Face size guard: reject if person is too far from camera ──────────
      const faceRatio = box.height / (displaySize.height || 1)
      const faceBigEnough = faceRatio >= MIN_FACE_SIZE

      const bestMatch = faceBigEnough ? matcher.findBestMatch(detection.descriptor) : null
      const isKnown   = faceBigEnough && bestMatch?.label !== 'unknown'

      // ── Margin check: if 2nd-closest is too similar, trigger disambiguation ─
      // Uses all per-employee descriptors for the most accurate distance comparison.
      let marginOk = true
      let topCandidates = []
      if (isKnown) {
        const allDescs = allDescsRef.current
        const empDists = Object.entries(allDescs).map(([id, descs]) => ({
          id,
          dist: Math.min(...descs.map(d => faceapi.euclideanDistance(detection.descriptor, d))),
        })).sort((a, b) => a.dist - b.dist)
        if (empDists.length >= 2 && (empDists[1].dist - empDists[0].dist) < MARGIN_MIN) {
          marginOk = false
          topCandidates = empDists.slice(0, 2)
        }
      }

      const color = isKnown && marginOk ? '#22c55e' : faceBigEnough ? '#3b82f6' : '#f59e0b'

      // Lerp smoothed box toward real detection (render loop reads this every frame)
      const sb = smoothBoxRef.current
      if (sb) {
        smoothBoxRef.current = {
          x: sb.x + (box.x      - sb.x) * LERP,
          y: sb.y + (box.y      - sb.y) * LERP,
          w: sb.w + (box.width  - sb.w) * LERP,
          h: sb.h + (box.height - sb.h) * LERP,
          color, miss: 0,
        }
      } else {
        smoothBoxRef.current = { x: box.x, y: box.y, w: box.width, h: box.height, color, miss: 0 }
      }

      if (isKnown && marginOk) {
        ambigBufRef.current = 0
        const empId     = bestMatch.label
        const framConf  = 1 - bestMatch.distance

        if (matchBufRef.current.id === empId) {
          matchBufRef.current.count++
        } else {
          matchBufRef.current = { id: empId, count: 1 }
          confBufRef.current  = []
        }

        // Rolling confidence average for stability
        confBufRef.current.push(framConf)
        if (confBufRef.current.length > CONF_BUF_SIZE) confBufRef.current.shift()
        const avgConfidence = confBufRef.current.reduce((s, v) => s + v, 0) / confBufRef.current.length

        if (matchBufRef.current.count >= CONFIRM_FRAMES && p === 'running') {
          const emp  = employeesRef.current.find(e => e._id === empId)
          const name = emp ? `${emp.firstName} ${emp.lastName}` : empId
          setConfirmed({ id: empId, name, confidence: avgConfidence })
          setPhaseSync('confirmed')
        }
      } else if (isKnown && !marginOk && faceBigEnough) {
        // Ambiguous match — face recognized but too similar to runner-up.
        // Accumulate stable frames then ask the employee to confirm their name.
        matchBufRef.current = { id: null, count: 0 }
        confBufRef.current  = []
        ambigBufRef.current++
        if (ambigBufRef.current >= CONFIRM_FRAMES && p === 'running') {
          const candidates = topCandidates.map(({ id, dist }) => {
            const emp = employeesRef.current.find(e => e._id === id)
            return { id, name: emp ? `${emp.firstName} ${emp.lastName}` : id, dist }
          })
          setAmbigCandidates(candidates)
          ambigBufRef.current = 0
          setPhaseSync('ambiguous')
        }
      } else {
        ambigBufRef.current = 0
        if (matchBufRef.current.id !== null) {
          matchBufRef.current = { id: null, count: 0 }
          confBufRef.current  = []
        }
        if (!faceBigEnough) {
          // Don't dismiss a confirmed match just because they stepped back briefly
          if (p !== 'confirmed') { /* no-op */ }
        } else if (p === 'confirmed') {
          setConfirmed(null); setPhaseSync('running')
        }
      }
    } else {
      // No face detected — grace period before clearing state
      if (smoothBoxRef.current) {
        smoothBoxRef.current.miss++
        if (smoothBoxRef.current.miss > GRACE) {
          smoothBoxRef.current = null
          matchBufRef.current  = { id: null, count: 0 }
          confBufRef.current   = []
          ambigBufRef.current  = 0
          if (p === 'confirmed') { setConfirmed(null); setPhaseSync('running') }
          if (p === 'ambiguous') { setAmbigCandidates([]); setPhaseSync('running') }
        }
      }
    }

    schedule()
  }, [getFaceApi])

  // ── Restore camera when tab becomes visible again ─────────────────────────
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return
      if (!['running', 'confirmed'].includes(phaseRef.current)) return
      // Check if the stream has gone dead (tab was hidden and browser killed the tracks)
      const dead = !streamRef.current ||
        streamRef.current.getTracks().every(t => t.readyState === 'ended')
      if (!dead) {
        // Stream alive but video may have paused — just resume
        videoRef.current?.play().catch(() => {})
        return
      }
      clearTimeout(rafRef.current)
      try {
        await startCamera()
        rafRef.current = setTimeout(detectLoop, DETECT_INTERVAL)
      } catch (err) {
        setLoadMsg('Camera lost: ' + err.message)
        setPhaseSync('error')
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [detectLoop])

  useEffect(() => {
    if (phase === 'running' || phase === 'confirmed') {
      rafRef.current = setTimeout(detectLoop, DETECT_INTERVAL)
    }
    return () => { clearTimeout(rafRef.current) }
  }, [phase, detectLoop])

  // Auto-reset confirmed or ambiguous state after idle
  useEffect(() => {
    clearTimeout(resetTimerRef.current)
    if (phase === 'confirmed') {
      resetTimerRef.current = setTimeout(() => {
        setConfirmed(null); matchBufRef.current = { id: null, count: 0 }; setPhaseSync('running')
      }, AUTO_RESET_MS)
    }
    if (phase === 'ambiguous') {
      resetTimerRef.current = setTimeout(() => {
        setAmbigCandidates([]); ambigBufRef.current = 0; setPhaseSync('running')
      }, AUTO_RESET_MS)
    }
    return () => clearTimeout(resetTimerRef.current)
  }, [phase, confirmed])

  const selectAmbigCandidate = (candidate) => {
    clearTimeout(resetTimerRef.current)
    setConfirmed({ id: candidate.id, name: candidate.name, confidence: 1 - candidate.dist })
    setAmbigCandidates([])
    ambigBufRef.current = 0
    setPhaseSync('confirmed')
  }

  // ── Punch handler ──────────────────────────────────────────────────────────
  const doPunch = async (type) => {
    if (!confirmed || !tenantCode) return
    clearTimeout(resetTimerRef.current)
    clearTimeout(rafRef.current)
    setPhaseSync('punching'); setPunchType(type)

    try {
      const { data: log } = await kioskFetch('POST', '/punch', tenantCode, {
        employeeId:      confirmed.id,
        type,
        confidenceScore: confirmed.confidence,
      })
      setRecent(prev => [log, ...prev].slice(0, 15))
      setPhaseSync('success')
      setTimeout(() => {
        setConfirmed(null); matchBufRef.current = { id: null, count: 0 }; confBufRef.current = []
        setPhaseSync('running')
        rafRef.current = setTimeout(detectLoop, DETECT_INTERVAL)
      }, SUCCESS_HOLD_MS)
    } catch (err) {
      setPunchError(err.message || 'Failed to record. Please try again.')
      setPhaseSync('fail')
      setTimeout(() => {
        setConfirmed(null); matchBufRef.current = { id: null, count: 0 }; confBufRef.current = []
        setPunchError('')
        setPhaseSync('running')
        rafRef.current = setTimeout(detectLoop, DETECT_INTERVAL)
      }, 4000)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!tenantCode || phase === 'setup') {
    return <SetupScreen onDone={tc => { setTenantCode(tc) }} />
  }
  // NOTE: no early return for 'loading' — video must stay mounted so startCamera
  // can attach the stream to videoRef before phase flips to 'running'

  const punchLabel = PUNCH_TYPES.find(p => p.key === punchType)?.label
  const statusLabels = {
    running:   'Scanning...',
    confirmed: 'Face matched',
    ambiguous: 'Confirm identity',
    punching:  'Recording...',
    success:   'Logged!',
    fail:      'Error',
    no_face:   'No faces enrolled',
    error:     'Error',
  }

  return (
    <div className="min-h-screen bg-navy-900 text-navy-50 flex flex-col overflow-hidden">

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3.5 bg-navy-800 border-b border-navy-500 shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-accent-400 leading-none">Aquino Bistro Group</h1>
            <span className="label-caps">Attendance Kiosk</span>
          </div>
          <div className="flex items-center gap-2 bg-navy-700 px-3 py-1 rounded-full border border-navy-500">
            <span className={`w-2 h-2 rounded-full ${['running','confirmed'].includes(phase) ? 'bg-signal-success animate-pulse' : 'bg-signal-warning'}`} />
            <span className="text-xs text-navy-300">{statusLabels[phase] || phase}</span>
          </div>
          <span className="text-2xs text-navy-400 font-mono select-none">{runtimeVersion || __APP_VERSION__}</span>
          {window.location.hostname === 'localhost' && (
            <button
              onClick={async () => {
                try { await fetch('/api/kiosk/sync', { method: 'POST' }) } catch (_) {}
                setReloadKey(k => k + 1)
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 text-2xs font-medium bg-navy-700 hover:bg-navy-600 text-navy-300 border border-navy-500 rounded-full transition-colors"
              title="Pull latest employees from central server"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync
            </button>
          )}
          <ThemeToggle />
        </div>
        <Clock />
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Camera panel */}
        <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
          {(phase === 'error' || phase === 'no_face') ? (
            <div className="text-center px-8 space-y-4">
              <p className="text-xl text-navy-300">{loadMsg}</p>
              <button
                onClick={() => setReloadKey(k => k + 1)}
                className="px-5 py-2 text-sm font-medium bg-navy-700 hover:bg-navy-600 text-navy-100 border border-navy-500 rounded-md transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="relative" style={{ maxWidth: 700, width: '100%' }}>
              {/* Video always mounted so stream can attach during loading */}
              <video
                ref={videoRef}
                autoPlay playsInline muted
                className="w-full rounded-2xl"
                style={{ transform: 'scaleX(-1)' }}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full rounded-2xl pointer-events-none"
                style={{ transform: 'scaleX(-1)' }}
              />

              {/* Loading overlay — shown while models/camera are spinning up */}
              {phase === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-navy-950/90 rounded-2xl gap-4">
                  <div className="w-14 h-14 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                  <p className="text-navy-300 text-lg">{loadMsg}</p>
                </div>
              )}

              {phase === 'running' && (
                <div className="absolute inset-0 rounded-2xl ring-2 ring-accent/40 animate-pulse pointer-events-none" />
              )}

              {/* Name + confidence bar */}
              <AnimatePresence>
                {confirmed && ['confirmed','punching'].includes(phase) && (
                  <motion.div
                    key="namebar"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-navy-950 via-navy-950/80 to-transparent px-6 pt-12 pb-5 rounded-b-2xl"
                  >
                    <p className="text-4xl font-bold">{confirmed.name}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {phase === 'running' && (
                <p className="absolute bottom-4 left-0 right-0 text-center text-sm px-4">
                  {matchBufRef.current.id
                    ? <span className="text-signal-warning animate-pulse font-semibold">
                        Hold still... ({Math.min(matchBufRef.current.count, CONFIRM_FRAMES)}/{CONFIRM_FRAMES})
                      </span>
                    : <span className="text-navy-400">Look at the camera</span>}
                </p>
              )}
            </div>
          )}

          {/* Disambiguation overlay — shown when two employees look too similar to auto-confirm */}
          <AnimatePresence>
            {phase === 'ambiguous' && (
              <motion.div
                key="disambiguation"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute inset-0 flex items-center justify-center bg-navy-950/95 z-10 rounded-2xl"
              >
                <div className="text-center px-8 w-full max-w-xs">
                  <p className="text-2xl font-bold mb-1">Who are you?</p>
                  <p className="text-navy-400 text-sm mb-6">Tap your name to continue</p>
                  <div className="space-y-3">
                    {ambigCandidates.map(c => (
                      <button
                        key={c.id}
                        onClick={() => selectAmbigCandidate(c)}
                        className="w-full bg-navy-700 hover:bg-navy-600 border border-navy-500 hover:border-accent py-4 rounded-xl font-semibold text-lg transition active:scale-95"
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setAmbigCandidates([]); ambigBufRef.current = 0; setPhaseSync('running') }}
                    className="mt-5 text-navy-500 text-sm hover:text-navy-300 transition"
                  >
                    That's not me
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Success overlay */}
          <AnimatePresence>
            {phase === 'success' && confirmed && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center bg-navy-950/95 z-10"
              >
                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', delay: 0.1 }}
                    className="text-6xl mb-6 text-signal-success"
                  >OK</motion.div>
                  <p className="text-5xl font-bold mb-3">{confirmed.name}</p>
                  <p className="text-2xl text-signal-success font-semibold">{punchLabel} recorded!</p>
                  <p className="text-navy-400 text-sm mt-3">
                    {new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </motion.div>
            )}
            {phase === 'fail' && (
              <motion.div
                key="fail"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center bg-navy-950/95 z-10"
              >
                <div className="text-center">
                  <p className="text-2xl text-signal-danger font-semibold mb-2">{punchError || 'Failed to record.'}</p>
                  {!punchError && <p className="text-navy-400 text-sm">Please try again.</p>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right panel */}
        <div className="w-80 bg-navy-800 border-l border-navy-500 flex flex-col shrink-0">

          {/* Punch buttons */}
          <div className="p-5 border-b border-navy-500">
            <p className="label-caps mb-3">
              {phase === 'confirmed' ? `Tap to log for ${confirmed?.name?.split(' ')[0]}` : 'Select punch type'}
            </p>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {ATTENDANCE_PUNCHES.map(pt => (
                  <button
                    key={pt.key}
                    disabled={phase !== 'confirmed'}
                    onClick={() => doPunch(pt.key)}
                    className={`${pt.bg} flex items-center justify-center py-5 rounded-lg font-semibold text-sm transition disabled:opacity-25 disabled:cursor-not-allowed active:scale-95`}
                  >
                    {pt.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 py-1">
                <div className="flex-1 h-px bg-navy-600" />
                <span className="text-2xs text-navy-500 uppercase tracking-wider">Break</span>
                <div className="flex-1 h-px bg-navy-600" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {BREAK_PUNCHES.map(pt => (
                  <button
                    key={pt.key}
                    disabled={phase !== 'confirmed'}
                    onClick={() => doPunch(pt.key)}
                    className={`${pt.bg} flex items-center justify-center py-4 rounded-lg font-semibold text-sm transition disabled:opacity-25 disabled:cursor-not-allowed active:scale-95`}
                  >
                    {pt.label}
                  </button>
                ))}
              </div>
            </div>
            {phase === 'running' && (
              <p className="text-center text-navy-400 text-xs mt-3">Waiting for face recognition...</p>
            )}
            {phase === 'ambiguous' && (
              <p className="text-center text-signal-warning text-xs mt-3 animate-pulse">Confirm your identity on screen</p>
            )}
            {phase === 'confirmed' && (
              <p className="text-center text-accent-400 text-xs mt-3 animate-pulse">Tap a button to record</p>
            )}
          </div>

          {/* Recent activity */}
          <div className="flex flex-col overflow-hidden" style={{ maxHeight: '260px' }}>
            <div className="px-4 pt-3 pb-1 shrink-0">
              <p className="label-caps">Today's Activity</p>
            </div>
            <div className="overflow-y-auto flex-1">
            {recent.length === 0 ? (
              <p className="text-navy-400 text-sm text-center mt-6">No punches yet today</p>
            ) : (
              <div className="divide-y divide-navy-500">
                {recent.map((log, i) => {
                  const emp  = log.employeeId
                  const name = emp ? `${emp.firstName} ${emp.lastName}` : '—'
                  return (
                    <div key={log._id || i} className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-navy-100 truncate">{name}</p>
                        <p className={`text-xs font-semibold ${TYPE_COLOR[log.type] || 'text-navy-400'}`}>
                          {log.type?.replace('_', ' ')}
                        </p>
                      </div>
                      <p className="text-navy-400 text-xs whitespace-nowrap ml-2">
                        {new Date(log.timestamp).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
            </div>
          </div>
          <div className="p-4 border-t border-navy-500 space-y-3">
            {/* Sync status */}
            {syncStatus !== null && (
              <div className="flex items-center justify-between">
                <span className="label-caps">Sync</span>
                {!syncStatus.online ? (
                  <div className="flex items-center gap-1.5 text-xs text-signal-danger font-semibold">
                    <span className="w-2 h-2 rounded-full bg-signal-danger shrink-0" />
                    Offline
                  </div>
                ) : syncStatus.pending > 0 ? (
                  <div className="flex items-center gap-1.5 text-xs text-signal-warning font-semibold">
                    <span className="w-2 h-2 rounded-full bg-signal-warning animate-pulse shrink-0" />
                    {syncStatus.pending} pending
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-signal-success font-semibold">
                    <span className="w-2 h-2 rounded-full bg-signal-success shrink-0" />
                    Synced
                  </div>
                )}
              </div>
            )}
            {/* Camera selector */}
            {cameras.length > 0 && (
              <div>
                <p className="label-caps mb-1">Camera</p>
                <select
                  value={selCam}
                  onChange={e => switchCamera(e.target.value)}
                  className="w-full bg-navy-700 border border-navy-500 rounded-md px-2 py-1.5 text-xs text-navy-200 focus:outline-none focus:border-accent"
                >
                  {cameras.map((cam, i) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="text-center">
              <p className="text-xs text-navy-400">
                Company: <span className="font-mono text-navy-300">{tenantCode}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

