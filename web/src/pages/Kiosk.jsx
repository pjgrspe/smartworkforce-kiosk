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
import * as faceapi from 'face-api.js'
import { motion, AnimatePresence } from 'framer-motion'

// ── Constants ─────────────────────────────────────────────────────────────────
const CDN_WEIGHTS      = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights'
const CONFIRM_FRAMES   = 4        // consecutive matching frames required before confirming
const MATCH_THRESHOLD  = 0.48     // max Euclidean distance for a valid match
const MARGIN_MIN       = 0.07     // min gap between best and 2nd-best match (ambiguity guard)
const EAR_BLINK_THRESH = 0.26     // eye aspect ratio below this counts as closed
const EAR_CONSEC_MIN   = 1        // frames eye must be closed to register a blink
const BLINKS_NEEDED    = 2        // number of distinct blinks required for liveness
const NOSE_MOTION_MIN  = 3.5      // min cumulative nose-tip pixel movement required
const LIVENESS_WINDOW  = 120      // max frames to wait for liveness (~6 s at 20fps)
const DETECT_INTERVAL  = 100      // ms between detection frames (~10 fps, stable)
const AUTO_RESET_MS    = 15_000   // auto-dismiss confirmed match after 15 s
const SUCCESS_HOLD_MS  = 3_500    // success screen display duration

// ── Eye Aspect Ratio (liveness / anti-photo spoofing) ────────────────────────
// EAR = (vertical distance avg) / (horizontal distance)
// A real face blinks; a printed photo never will.
function eucDist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) }
function eyeEAR(pts, p1, p2, p3, p4, p5, p6) {
  return (eucDist(pts[p2], pts[p6]) + eucDist(pts[p3], pts[p5])) / (2 * eucDist(pts[p1], pts[p4]))
}
function calcEAR(landmarks) {
  const pts = landmarks.positions
  // Left eye: 36-41, Right eye: 42-47 (68-point model)
  const leftEAR  = eyeEAR(pts, 36, 37, 38, 39, 40, 41)
  const rightEAR = eyeEAR(pts, 42, 43, 44, 45, 46, 47)
  return (leftEAR + rightEAR) / 2
}

const PUNCH_TYPES = [
  { key: 'IN',        label: 'Time In',    bg: 'bg-green-600  hover:bg-green-500',  icon: '🟢' },
  { key: 'BREAK_OUT', label: 'Break Out',  bg: 'bg-amber-500  hover:bg-amber-400',  icon: '🟡' },
  { key: 'BREAK_IN',  label: 'Break In',   bg: 'bg-blue-600   hover:bg-blue-500',   icon: '🔵' },
  { key: 'OUT',       label: 'Time Out',   bg: 'bg-red-600    hover:bg-red-500',    icon: '🔴' },
]

const TYPE_COLOR = {
  IN: 'text-green-400', OUT: 'text-red-400',
  BREAK_OUT: 'text-amber-400', BREAK_IN: 'text-blue-400',
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
      <p className="text-sm text-gray-400 mt-0.5">
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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-900 border border-gray-800 rounded-3xl p-12 shadow-2xl w-[420px] text-white text-center"
      >
        <div className="text-7xl mb-4">👁️</div>
        <h1 className="text-4xl font-bold mb-1">Apollo Kiosk</h1>
        <p className="text-gray-400 mb-8 text-sm">Enter your company code to start</p>
        {err && <p className="text-red-400 text-sm mb-4">{err}</p>}
        <input
          autoFocus
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && verify()}
          placeholder="COMPANY"
          className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-2xl text-center tracking-[0.3em] uppercase mb-5 focus:outline-none focus:border-blue-500 transition"
        />
        <button
          onClick={verify}
          disabled={busy}
          className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-bold text-lg transition disabled:opacity-50"
        >
          {busy ? 'Verifying…' : 'Start Kiosk'}
        </button>
      </motion.div>
    </div>
  )
}

// ── Loading screen ────────────────────────────────────────────────────────────
function LoadingScreen({ message }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white gap-6">
      <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-xl text-gray-300">{message}</p>
    </div>
  )
}

// ── Main kiosk ────────────────────────────────────────────────────────────────
export default function Kiosk() {
  const [tenantCode, setTenantCode] = useState(() => localStorage.getItem('kiosk_tenant') || '')

  // phase: setup | loading | running | confirmed | punching | success | fail | error | no_face
  const [phase,     setPhase]     = useState('loading')
  const [loadMsg,   setLoadMsg]   = useState('Initializing…')
  const [confirmed, setConfirmed] = useState(null)     // { id, name, confidence }
  const [punchType, setPunchType] = useState(null)
  const [recent,    setRecent]    = useState([])
  const [employees, setEmployees] = useState([])

  const videoRef      = useRef(null)
  const canvasRef     = useRef(null)
  const rafRef        = useRef(null)
  const matcherRef    = useRef(null)
  const streamRef     = useRef(null)
  const phaseRef      = useRef('loading')
  const matchBufRef   = useRef({ id: null, count: 0 })
  const cooldownRef   = useRef(0)
  const resetTimerRef = useRef(null)
  const employeesRef  = useRef([])   // mirror of employees state for use in RAF
  const meanDescRef   = useRef({})   // employeeId → Float32Array (for margin check)
  // Liveness state: track blink detection per match attempt
  const livenessRef   = useRef({ earClosed: 0, blinkCount: 0, eyeWasOpen: true, nosePrev: null, noseMotion: 0, frameCount: 0 })

  const [cameras, setCameras] = useState([])
  const [selCam,  setSelCam]  = useState('')

  const setPhaseSync = (p) => { phaseRef.current = p; setPhase(p) }

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

  // ── Load models + data ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantCode) { setPhaseSync('setup'); return }

    let cancelled = false
    ;(async () => {
      try {
        setPhaseSync('loading'); setLoadMsg('Loading AI recognition models…')
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(CDN_WEIGHTS),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(CDN_WEIGHTS),
          faceapi.nets.faceRecognitionNet.loadFromUri(CDN_WEIGHTS),
        ])
        if (cancelled) return

        setLoadMsg('Loading employee data…')
        const { data: emps } = await kioskFetch('GET', '/employees', tenantCode)
        if (cancelled) return

        setEmployees(emps)
        employeesRef.current = emps

        const labeled = emps
          .filter(e => e.faceData?.faceApiDescriptors?.length > 0)
          .map(e => {
            const descs = e.faceData.faceApiDescriptors
            // Compute the mean of all enrollment descriptors.
            // A single centroid vector is more stable than matching against individual samples.
            const mean = new Float32Array(128)
            for (const d of descs) {
              for (let i = 0; i < 128; i++) mean[i] += d[i]
            }
            for (let i = 0; i < 128; i++) mean[i] /= descs.length
            meanDescRef.current[e._id] = mean   // store for margin check
            return new faceapi.LabeledFaceDescriptors(e._id, [mean])
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
        if (!cancelled) { setLoadMsg('Error: ' + err.message); setPhaseSync('error') }
      }
    })()
    return () => { cancelled = true }
  }, [tenantCode])

  // ── Camera ─────────────────────────────────────────────────────────────────
  const startCamera = async (deviceId) => {
    const camId = deviceId || selCam
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        ...(camId ? { deviceId: { exact: camId } } : { facingMode: 'user' }),
        width: { ideal: 640 }, height: { ideal: 480 }
      },
    })
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

  // ── Detection loop — runs at ~10fps via setTimeout, NO canvas drawing ─────
  const detectLoop = useCallback(async () => {
    const video   = videoRef.current
    const canvas  = canvasRef.current
    const matcher = matcherRef.current

    const schedule = () => { rafRef.current = setTimeout(detectLoop, DETECT_INTERVAL) }

    if (!video || !canvas || !matcher || video.readyState < 2) { schedule(); return }
    if (Date.now() < cooldownRef.current)                       { schedule(); return }

    const p = phaseRef.current
    if (['punching', 'success', 'fail'].includes(p))            { schedule(); return }

    const displaySize = { width: video.videoWidth, height: video.videoHeight }
    faceapi.matchDimensions(canvas, displaySize)

    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.35, inputSize: 416 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor()

    const LERP  = 0.4
    const GRACE = 20

    if (detection) {
      const resized   = faceapi.resizeResults(detection, displaySize)
      const box       = resized.detection.box
      const bestMatch = matcher.findBestMatch(detection.descriptor)
      const isKnown   = bestMatch.label !== 'unknown'

      // ── Margin check: reject if 2nd-closest employee is too similar ──────
      let marginOk = true
      if (isKnown) {
        const descMap = meanDescRef.current
        const dists = Object.entries(descMap)
          .map(([id, d]) => ({ id, dist: faceapi.euclideanDistance(detection.descriptor, d) }))
          .sort((a, b) => a.dist - b.dist)
        if (dists.length >= 2 && (dists[1].dist - dists[0].dist) < MARGIN_MIN) {
          marginOk = false
        }
      }

      // ── Liveness: EAR blink + nose motion ───────────────────────────────
      const ear  = detection.landmarks ? calcEAR(detection.landmarks) : 1
      const nose = detection.landmarks ? detection.landmarks.positions[30] : null
      if (isKnown && marginOk) {
        const lv = livenessRef.current
        if (ear < EAR_BLINK_THRESH) {
          lv.earClosed++
          if (lv.earClosed >= EAR_CONSEC_MIN && lv.eyeWasOpen) {
            lv.blinkCount++
            lv.eyeWasOpen = false
          }
        } else {
          lv.earClosed  = 0
          lv.eyeWasOpen = true
        }
        if (nose && lv.nosePrev) lv.noseMotion += eucDist(nose, lv.nosePrev)
        lv.nosePrev = nose
        lv.frameCount++
        if (lv.frameCount > LIVENESS_WINDOW) {
          matchBufRef.current = { id: null, count: 0 }
          livenessRef.current = { earClosed: 0, blinkCount: 0, eyeWasOpen: true, nosePrev: null, noseMotion: 0, frameCount: 0 }
        }
      }

      const lv         = livenessRef.current
      const blinkReady = lv.blinkCount >= BLINKS_NEEDED && lv.noseMotion >= NOSE_MOTION_MIN
      const color      = isKnown && marginOk ? '#22c55e' : '#3b82f6'

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
        const empId      = bestMatch.label
        const confidence = 1 - bestMatch.distance
        if (matchBufRef.current.id === empId) matchBufRef.current.count++
        else {
          matchBufRef.current = { id: empId, count: 1 }
          livenessRef.current = { earClosed: 0, blinkCount: 0, eyeWasOpen: true, nosePrev: null, noseMotion: 0, frameCount: 0 }
        }
        if (matchBufRef.current.count >= CONFIRM_FRAMES && blinkReady && p === 'running') {
          const emp  = employeesRef.current.find(e => e._id === empId)
          const name = emp ? `${emp.firstName} ${emp.lastName}` : empId
          setConfirmed({ id: empId, name, confidence })
          setPhaseSync('confirmed')
        }
      } else {
        matchBufRef.current = { id: null, count: 0 }
        livenessRef.current = { earClosed: 0, blinkCount: 0, eyeWasOpen: true, nosePrev: null, noseMotion: 0, frameCount: 0 }
        if (p === 'confirmed') { setConfirmed(null); setPhaseSync('running') }
      }
    } else {
      // No detection — increment miss counter; clear only after GRACE misses
      if (smoothBoxRef.current) {
        smoothBoxRef.current.miss++
        if (smoothBoxRef.current.miss > GRACE) {
          smoothBoxRef.current = null
          matchBufRef.current = { id: null, count: 0 }
          livenessRef.current = { earClosed: 0, blinkCount: 0, eyeWasOpen: true, nosePrev: null, noseMotion: 0, frameCount: 0 }
          if (p === 'confirmed') { setConfirmed(null); setPhaseSync('running') }
        }
      }
    }

    schedule()
  }, [])

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

  // Auto-reset confirmed match after idle
  useEffect(() => {
    clearTimeout(resetTimerRef.current)
    if (phase === 'confirmed') {
      resetTimerRef.current = setTimeout(() => {
        setConfirmed(null); matchBufRef.current = { id: null, count: 0 }; setPhaseSync('running')
      }, AUTO_RESET_MS)
    }
    return () => clearTimeout(resetTimerRef.current)
  }, [phase, confirmed])

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
      cooldownRef.current = Date.now() + SUCCESS_HOLD_MS + 1500
      setPhaseSync('success')
      setTimeout(() => {
        setConfirmed(null); matchBufRef.current = { id: null, count: 0 }
        setPhaseSync('running')
        rafRef.current = setTimeout(detectLoop, DETECT_INTERVAL)
      }, SUCCESS_HOLD_MS)
    } catch {
      setPhaseSync('fail')
      setTimeout(() => {
        setConfirmed(null); matchBufRef.current = { id: null, count: 0 }
        setPhaseSync('running')
        rafRef.current = setTimeout(detectLoop, DETECT_INTERVAL)
      }, 3000)
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
    running:   'Scanning…',
    confirmed: 'Face matched',
    punching:  'Recording…',
    success:   'Logged!',
    fail:      'Error',
    no_face:   'No faces enrolled',
    error:     'Error',
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-blue-400 leading-none">Apollo</h1>
            <span className="text-xs text-gray-500 tracking-widest uppercase">Attendance Kiosk</span>
          </div>
          <div className="flex items-center gap-2 bg-gray-800 px-3 py-1 rounded-full">
            <span className={`w-2 h-2 rounded-full ${['running','confirmed'].includes(phase) ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
            <span className="text-xs text-gray-400">{statusLabels[phase] || phase}</span>
          </div>
        </div>
        <Clock />
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Camera panel */}
        <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
          {(phase === 'error' || phase === 'no_face') ? (
            <div className="text-center px-8">
              <p className="text-6xl mb-4">{phase === 'no_face' ? '🙈' : '⚠️'}</p>
              <p className="text-xl text-gray-300">{loadMsg}</p>
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
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/90 rounded-2xl gap-4">
                  <div className="w-14 h-14 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-300 text-lg">{loadMsg}</p>
                </div>
              )}

              {phase === 'running' && (
                <div className="absolute inset-0 rounded-2xl ring-2 ring-blue-500/40 animate-pulse pointer-events-none" />
              )}

              {/* Name + confidence bar */}
              <AnimatePresence>
                {confirmed && ['confirmed','punching'].includes(phase) && (
                  <motion.div
                    key="namebar"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-950 via-gray-950/80 to-transparent px-6 pt-12 pb-5 rounded-b-2xl"
                  >
                    <p className="text-4xl font-bold">{confirmed.name}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex-1 bg-gray-700 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-green-400 h-2 rounded-full transition-all duration-700"
                          style={{ width: `${Math.round(confirmed.confidence * 100)}%` }}
                        />
                      </div>
                      <span className="text-green-400 font-semibold text-sm whitespace-nowrap">
                        {Math.round(confirmed.confidence * 100)}% match
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {phase === 'running' && (
                <p className="absolute bottom-4 left-0 right-0 text-center text-sm px-4">
                  {matchBufRef.current.id && livenessRef.current.blinkCount < BLINKS_NEEDED
                    ? <span className="text-yellow-400 animate-pulse font-semibold">👁️ Blink twice to verify ({livenessRef.current.blinkCount}/{BLINKS_NEEDED})</span>
                    : matchBufRef.current.id && livenessRef.current.noseMotion < NOSE_MOTION_MIN
                    ? <span className="text-yellow-400 animate-pulse font-semibold">🤏 Move slightly to verify</span>
                    : <span className="text-gray-600">Look at the camera</span>}
                </p>
              )}
            </div>
          )}

          {/* Success overlay */}
          <AnimatePresence>
            {phase === 'success' && confirmed && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center bg-gray-950/95 z-10"
              >
                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', delay: 0.1 }}
                    className="text-9xl mb-6"
                  >✅</motion.div>
                  <p className="text-5xl font-bold mb-3">{confirmed.name}</p>
                  <p className="text-2xl text-green-400 font-semibold">{punchLabel} recorded!</p>
                  <p className="text-gray-500 text-sm mt-3">
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
                className="absolute inset-0 flex items-center justify-center bg-red-950/90 z-10"
              >
                <div className="text-center">
                  <p className="text-8xl mb-4">❌</p>
                  <p className="text-2xl text-red-300">Failed to record. Please try again.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right panel */}
        <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">

          {/* Punch buttons */}
          <div className="p-5 border-b border-gray-800">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">
              {phase === 'confirmed' ? `Tap to log for ${confirmed?.name?.split(' ')[0]}` : 'Select punch type'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {PUNCH_TYPES.map(pt => (
                <button
                  key={pt.key}
                  disabled={phase !== 'confirmed'}
                  onClick={() => doPunch(pt.key)}
                  className={`${pt.bg} flex flex-col items-center gap-2 py-5 rounded-2xl font-semibold text-sm transition disabled:opacity-25 disabled:cursor-not-allowed active:scale-95`}
                >
                  <span className="text-2xl">{pt.icon}</span>
                  {pt.label}
                </button>
              ))}
            </div>
            {phase === 'running' && (
              <p className="text-center text-gray-600 text-xs mt-3">Waiting for face recognition…</p>
            )}
            {phase === 'confirmed' && (
              <p className="text-center text-blue-400 text-xs mt-3 animate-pulse">Tap a button to record</p>
            )}
          </div>

          {/* Recent activity */}
          <div className="flex flex-col overflow-hidden" style={{ maxHeight: '260px' }}>
            <div className="px-4 pt-3 pb-1 shrink-0">
              <p className="text-xs text-gray-500 uppercase tracking-widest">Today's Activity</p>
            </div>
            <div className="overflow-y-auto flex-1">
            {recent.length === 0 ? (
              <p className="text-gray-600 text-sm text-center mt-6">No punches yet today</p>
            ) : (
              <div className="divide-y divide-gray-800">
                {recent.map((log, i) => {
                  const emp  = log.employeeId
                  const name = emp ? `${emp.firstName} ${emp.lastName}` : '—'
                  return (
                    <div key={log._id || i} className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-200 truncate">{name}</p>
                        <p className={`text-xs font-semibold ${TYPE_COLOR[log.type] || 'text-gray-400'}`}>
                          {log.type?.replace('_', ' ')}
                        </p>
                      </div>
                      <p className="text-gray-500 text-xs whitespace-nowrap ml-2">
                        {new Date(log.timestamp).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
            </div>
          </div>
          <div className="p-4 border-t border-gray-800 space-y-3">
            {/* Camera selector */}
            {cameras.length > 0 && (
              <div>
                <p className="text-xs text-gray-600 mb-1">📷 Camera</p>
                <select
                  value={selCam}
                  onChange={e => switchCamera(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
                >
                  {cameras.map((cam, i) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="text-center space-y-1">
              <p className="text-xs text-gray-600">
                Company: <span className="font-mono text-gray-500">{tenantCode}</span>
              </p>
              <button
                onClick={() => {
                  if (!window.confirm('Reset kiosk? You will need to re-enter the company code.')) return
                  clearTimeout(rafRef.current)
                  streamRef.current?.getTracks().forEach(t => t.stop())
                  localStorage.removeItem('kiosk_tenant')
                  matcherRef.current = null
                  setTenantCode('')
                  setConfirmed(null)
                  setPhaseSync('setup')
                }}
                className="text-xs text-gray-700 hover:text-gray-400 transition"
              >
                ⚙ Reset / Change Company
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

