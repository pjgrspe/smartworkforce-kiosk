/**
 * Login - Entry point.
 * Split-screen: blueprint panel (left) / auth form (right).
 * Design language: Executive Minimalism, no gradients, no glow.
 */

import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import ThemeToggle from '../components/ui/ThemeToggle'

// Abstract blueprint SVG (inline, no external deps)
function Blueprint() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.07]"
      viewBox="0 0 640 720"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* Fine grid */}
      {Array.from({ length: 32 }).map((_, i) => (
        <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2="720" stroke="#3b82f6" strokeWidth="0.4" />
      ))}
      {Array.from({ length: 37 }).map((_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 20} x2="640" y2={i * 20} stroke="#3b82f6" strokeWidth="0.4" />
      ))}
      {/* Coarse grid overlay */}
      {Array.from({ length: 7 }).map((_, i) => (
        <line key={`cv${i}`} x1={i * 100} y1="0" x2={i * 100} y2="720" stroke="#3b82f6" strokeWidth="0.8" />
      ))}
      {Array.from({ length: 8 }).map((_, i) => (
        <line key={`ch${i}`} x1="0" y1={i * 100} x2="640" y2={i * 100} stroke="#3b82f6" strokeWidth="0.8" />
      ))}
      {/* Circuit traces */}
      <rect x="140" y="160" width="100" height="100" stroke="#3b82f6" strokeWidth="1.5" />
      <circle cx="190" cy="210" r="28" stroke="#3b82f6" strokeWidth="1.5" />
      <circle cx="190" cy="210" r="5"  fill="#3b82f6" />
      <line x1="190" y1="160" x2="190" y2="100" stroke="#3b82f6" strokeWidth="1.5" />
      <line x1="240" y1="210" x2="320" y2="210" stroke="#3b82f6" strokeWidth="1.5" />
      <line x1="320" y1="210" x2="320" y2="160" stroke="#3b82f6" strokeWidth="1.5" />
      <line x1="320" y1="160" x2="420" y2="160" stroke="#3b82f6" strokeWidth="1.5" />
      <rect x="420" y="140" width="60" height="40" stroke="#3b82f6" strokeWidth="1.5" />
      <line x1="140" y1="210" x2="80"  y2="210" stroke="#3b82f6" strokeWidth="1.5" />
      <line x1="80"  y1="210" x2="80"  y2="360" stroke="#3b82f6" strokeWidth="1.5" />
      <line x1="80"  y1="360" x2="200" y2="360" stroke="#3b82f6" strokeWidth="1.5" />
      <rect x="200" y="340" width="60" height="40" stroke="#3b82f6" strokeWidth="1.5" />
      <line x1="260" y1="360" x2="400" y2="360" stroke="#3b82f6" strokeWidth="1.5" />
      <circle cx="400" cy="360" r="10" stroke="#3b82f6" strokeWidth="1.5" />
      <line x1="410" y1="330" x2="460" y2="280" stroke="#3b82f6" strokeWidth="1.5" />
      <rect x="460" y="260" width="80" height="50" stroke="#3b82f6" strokeWidth="1.5" />
      {/* Node circles */}
      {[[190,100],[320,160],[80,210],[200,360],[400,360],[190,260]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="3.5" fill="#3b82f6" />
      ))}
      {/* Data block */}
      <rect x="300" y="460" width="160" height="110" stroke="#3b82f6" strokeWidth="2" />
      <line x1="300" y1="480" x2="460" y2="480" stroke="#3b82f6" strokeWidth="0.6" />
      <line x1="300" y1="500" x2="460" y2="500" stroke="#3b82f6" strokeWidth="0.6" />
      <line x1="300" y1="520" x2="460" y2="520" stroke="#3b82f6" strokeWidth="0.6" />
      <line x1="300" y1="540" x2="460" y2="540" stroke="#3b82f6" strokeWidth="0.6" />
      <rect x="310" y="465" width="40" height="9" rx="1" fill="#3b82f6" fillOpacity="0.5" />
      {[0,1,2,3].map(i => (
        <rect key={i} x="310" y={487 + i * 20} width={30 + i * 14} height="6" rx="1" fill="#3b82f6" fillOpacity="0.2" />
      ))}
      {/* Crosshair */}
      <line x1="100" y1="560" x2="140" y2="560" stroke="#3b82f6" strokeWidth="1.5" />
      <line x1="120" y1="540" x2="120" y2="580" stroke="#3b82f6" strokeWidth="1.5" />
      <circle cx="120" cy="560" r="14" stroke="#3b82f6" strokeWidth="1" />
      <circle cx="120" cy="560" r="3"  fill="#3b82f6" fillOpacity="0.6" />
      {/* Corner annotations */}
      <text x="8" y="14" fill="#3b82f6" fontSize="7" fontFamily="monospace">REF:A1</text>
      <text x="580" y="714" fill="#3b82f6" fontSize="7" fontFamily="monospace">SYS:2.0</text>
    </svg>
  )
}

// Stat strip item
function Stat({ value, label }) {
  return (
    <div>
      <p className="text-xl font-bold text-accent tabular">{value}</p>
      <p className="text-xs text-navy-400 uppercase tracking-[0.15em] mt-0.5">{label}</p>
    </div>
  )
}

// Main component
export default function Login() {
  const { signIn }   = useAuth()
  const navigate     = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Authentication failed. Check credentials and try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = `
    w-full h-9 px-3 text-sm bg-navy-600 border border-navy-500 text-navy-100
    placeholder:text-navy-400/50
    focus:outline-none focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/30
    transition-colors duration-80 rounded-md
  `

  return (
    <div className="min-h-screen flex bg-navy-900">

      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* LEFT - Brand / Blueprint panel */}
      <div className="hidden lg:flex flex-col w-[58%] relative bg-navy-800 border-r border-navy-500/30 overflow-hidden">
        <Blueprint />

        {/* Layered content */}
        <div className="relative z-10 flex flex-col h-full px-14 py-14">

          {/* Wordmark */}
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-bold tracking-tight text-navy-50">DE WEBNET</span>
              <span className="text-xs text-navy-400 font-mono">v2.0</span>
            </div>
            <p className="text-xs text-navy-400 uppercase tracking-[0.12em] mt-1 font-medium">
              HR &amp; Payroll Platform
            </p>
          </div>

          {/* Hero copy */}
          <div className="mt-auto">
            <h1 className="text-[48px] font-thin text-navy-50 leading-[1.1] tracking-tighter">
              Precision<br />
              <span className="font-bold">Workforce</span><br />
              Management
            </h1>
            <p className="mt-5 text-sm text-navy-200 max-w-[360px] leading-relaxed font-light">
              Enterprise-grade attendance tracking, dynamic scheduling, and automated
              payroll computation - powered by facial recognition.
            </p>

            {/* Metrics strip */}
            <div className="mt-10 flex items-start gap-10 border-t border-navy-500/30 pt-6">
              <Stat value="99.4%" label="Recognition Accuracy" />
              <Stat value="~0.3s" label="Avg. Process Time" />
              <Stat value="Offline" label="Edge Resilience" />
            </div>
          </div>

          {/* Footer classification */}
          <div className="mt-10 flex items-center justify-between text-xs text-navy-500
                          uppercase tracking-[0.11em] border-t border-navy-500/20 pt-4">
            <span>DE WEBNET Systems (c) 2026</span>
            <span className="font-mono">REV 2.0.0 // PH-REGION</span>
          </div>
        </div>
      </div>

      {/* RIGHT - Authentication form */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-16">

        {/* Mobile wordmark */}
        <div className="lg:hidden mb-10 text-center">
          <p className="text-2xl font-bold tracking-tight text-navy-50">DE WEBNET</p>
          <p className="text-xs text-navy-400 uppercase tracking-[0.12em] mt-1">HR &amp; Payroll</p>
        </div>

        <div className="w-full max-w-[320px]">
          <div className="mb-8">
            <h2 className="text-[17px] font-semibold text-navy-50">System Access</h2>
            <p className="text-xs text-navy-400 mt-1">Enter your credentials to authenticate.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
              <div className="px-3 py-2.5 bg-signal-danger/8 border border-signal-danger/30
                              text-signal-danger text-xs rounded-md leading-snug">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="label-caps">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="user@domain.com"
                className={inputCls}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="label-caps">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="**********"
                className={inputCls}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full h-9 bg-accent hover:bg-accent-400 text-white text-sm font-semibold
                         transition-colors duration-80 rounded-md
                         disabled:opacity-40 disabled:cursor-not-allowed
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              {loading ? 'Authenticating...' : 'Sign In ->'}
            </button>
          </form>

          <p className="mt-10 text-center text-xs text-navy-500 uppercase tracking-[0.11em]">
            DE WEBNET Platform // Secured Access
          </p>
        </div>
      </div>
    </div>
  )
}


