const VERIFIED_AT_KEY = 'dewebnet_sensitive_auth_at'
const LAST_ACTIVITY_AT_KEY = 'dewebnet_sensitive_auth_last_activity_at'

export const SENSITIVE_AUTH_TTL_MS = 10 * 60 * 1000
export const SENSITIVE_AUTH_IDLE_TIMEOUT_MS = 5 * 60 * 1000

function safeSet(key, value) {
  try {
    sessionStorage.setItem(key, String(value))
  } catch {
    // no-op in restricted storage contexts
  }
}

function safeGetNumber(key) {
  try {
    const value = Number(sessionStorage.getItem(key))
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

export function touchSensitiveAuthActivity(now = Date.now()) {
  safeSet(LAST_ACTIVITY_AT_KEY, now)
}

export function markSensitiveAuthNow() {
  const now = Date.now()
  safeSet(VERIFIED_AT_KEY, now)
  touchSensitiveAuthActivity(now)
}

export function clearSensitiveAuth() {
  try {
    sessionStorage.removeItem(VERIFIED_AT_KEY)
    sessionStorage.removeItem(LAST_ACTIVITY_AT_KEY)
  } catch {
    // no-op
  }
}

export function hasFreshSensitiveAuth(
  ttlMs = SENSITIVE_AUTH_TTL_MS,
  idleTimeoutMs = SENSITIVE_AUTH_IDLE_TIMEOUT_MS
) {
  const now = Date.now()
  const verifiedAt = safeGetNumber(VERIFIED_AT_KEY)
  if (!verifiedAt || now - verifiedAt > ttlMs) return false

  const lastActivityAt = safeGetNumber(LAST_ACTIVITY_AT_KEY)
  if (!lastActivityAt || now - lastActivityAt > idleTimeoutMs) return false

  return true
}

export function startSensitiveAuthActivityTracking() {
  if (typeof window === 'undefined') return () => {}

  let lastWrite = 0
  const THROTTLE_MS = 15 * 1000
  const update = () => {
    const now = Date.now()
    if (now - lastWrite < THROTTLE_MS) return
    lastWrite = now
    touchSensitiveAuthActivity(now)
  }

  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
  events.forEach((eventName) => window.addEventListener(eventName, update, { passive: true }))
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') update()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  // Seed last activity immediately when tracking starts.
  update()

  return () => {
    events.forEach((eventName) => window.removeEventListener(eventName, update))
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
