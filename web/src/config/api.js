/**
 * HTTP API Client
 * Thin wrapper around fetch that attaches the stored JWT.
 */

const BASE_URL = import.meta.env.VITE_API_URL || '/api'
const MAX_SAFE_TOKEN_LENGTH = 6000
const CENTRAL_URL_KEY = 'dewebnet_central_url'

// Active tenant override — set by TenantContext when super_admin switches company
let _activeTenantId = null
export function setActiveTenantId(id) { _activeTenantId = id }

function getBaseUrl() {
  return localStorage.getItem(CENTRAL_URL_KEY) || BASE_URL
}

function saveCentralUrl(url) {
  localStorage.setItem(CENTRAL_URL_KEY, url)
}

function clearCentralUrl() {
  localStorage.removeItem(CENTRAL_URL_KEY)
}

function getToken() {
  const token = localStorage.getItem('dewebnet_token')
  if (!token) return null

  // Oversized JWTs can cause HTTP 431 (request headers too large).
  if (token.length > MAX_SAFE_TOKEN_LENGTH) {
    clearToken()
    return null
  }

  return token
}

function saveToken(token) {
  localStorage.setItem('dewebnet_token', token)
}

function clearToken() {
  localStorage.removeItem('dewebnet_token')
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (_activeTenantId) headers['X-Active-Tenant'] = _activeTenantId

  const res = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })

  let data = null
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    data = await res.json()
  }

  if (res.status === 401) {
    if (token) {
      console.error('[DEX 401] Unauthorized →', method, `${getBaseUrl()}${path}`, data)
      clearToken()
      clearCentralUrl()
      window.location.href = '/login'
    }
    throw new Error(data?.error || 'Authentication failed')
  }

  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`)
  }

  return data
}

// ── Auth ──────────────────────────────────────────────────────────
export async function login(email, password) {
  // Always hit the local server for login — it handles proxying to central if needed.
  // Never use getBaseUrl() here or a stale centralUrl from a previous session would
  // bypass the branch proxy and break the central redirect flow.
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = res.ok ? await res.json() : await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  saveToken(data.token)
  if (data.centralUrl) {
    saveCentralUrl(data.centralUrl)
  } else {
    clearCentralUrl()
  }
  return data
}

export const verifyPassword = (password) => request('POST', '/auth/verify-password', { password })

export function logout() {
  clearToken()
  clearCentralUrl()
}

// ── Employees ─────────────────────────────────────────────────────
export const getEmployees   = ()         => request('GET',    '/employees')
export const getEmployee    = (id)       => request('GET',    `/employees/${id}`)
export const getMyEmployeeProfile = ()   => request('GET',    '/employees/me')
export const createEmployee = (payload)  => request('POST',   '/employees', payload)
export const updateEmployee  = (id, body)        => request('PATCH',  `/employees/${id}`, body)
export const deleteEmployee  = (id)              => request('DELETE', `/employees/${id}`)
export const enrollFace               = (id, descriptors) => request('PATCH',  `/employees/${id}/enroll-face`, { descriptors })
export const uploadEmployeeDocument   = (id, doc)         => request('POST',   `/employees/${id}/documents`, doc)
export const deleteEmployeeDocument   = (id, docId)       => request('DELETE', `/employees/${id}/documents/${docId}`)
export async function downloadEmployeeDocument(id, docId, fileName) {
  const headers = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${getBaseUrl()}/employees/${id}/documents/${docId}`, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName || 'document'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Attendance ────────────────────────────────────────────────────
export const getAttendance = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return request('GET', `/attendance${qs ? '?' + qs : ''}`)
}
export const getTodayAttendance = () => request('GET', '/attendance/today')
export const getMyAttendance = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return request('GET', `/attendance/me${qs ? '?' + qs : ''}`)
}

// ── Platform Status ────────────────────────────────────────────────
export const getHealth = () => request('GET', '/health')
export const getSyncStatus = (params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString()
  return request('GET', `/sync/status${qs ? '?' + qs : ''}`)
}

// ── Branches ─────────────────────────────────────────────────────
export const getBranches   = ()          => request('GET',    '/branches')
export const createBranch  = (body)      => request('POST',   '/branches', body)
export const updateBranch  = (id, body)  => request('PATCH',  `/branches/${id}`, body)
export const deleteBranch  = (id)        => request('DELETE', `/branches/${id}`)

// ── Departments ───────────────────────────────────────────────────
export const getDepartments  = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return request('GET', `/departments${qs ? '?' + qs : ''}`)
}
export const createDepartment = (body)     => request('POST',   '/departments', body)
export const updateDepartment = (id, body) => request('PATCH',  `/departments/${id}`, body)
export const deleteDepartment = (id)       => request('DELETE', `/departments/${id}`)

// ── Schedules ─────────────────────────────────────────────────────
export const getSchedules   = ()          => request('GET',    '/schedules')
export const createSchedule = (body)      => request('POST',   '/schedules', body)
export const updateSchedule = (id, body)  => request('PATCH',  `/schedules/${id}`, body)
export const deleteSchedule = (id)        => request('DELETE', `/schedules/${id}`)

// ── Users ─────────────────────────────────────────────────────────
export const getUsers   = ()          => request('GET',    '/users')
export const getMyUserProfile = ()    => request('GET',    '/users/me')
export const createUser = (body)      => request('POST',   '/users', body)
export const updateUser = (id, body)  => request('PATCH',  `/users/${id}`, body)
export const deleteUser = (id)        => request('DELETE', `/users/${id}`)
export async function updateMyUserProfile(body) {
  const data = await request('PATCH', '/users/me', body)
  if (data?.token) saveToken(data.token)
  return data
}

// ── Salary Structures ─────────────────────────────────────────────
export const getSalaryStructures = ()             => request('GET',   '/salary')
export const getSalaryHistory = (employeeId) => request('GET',   `/salary/${employeeId}`)
export const createSalary     = (body)       => request('POST',  '/salary', body)
export const updateSalary     = (id, body)   => request('PATCH', `/salary/${id}`, body)

// ── Holidays ──────────────────────────────────────────────────────
export const getHolidays   = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return request('GET', `/holidays${qs ? '?' + qs : ''}`)
}
export const createHoliday = (body)      => request('POST',   '/holidays', body)
export const bulkHolidays  = (holidays)  => request('POST',   '/holidays/bulk', { holidays })
export const deleteHoliday = (id)        => request('DELETE', `/holidays/${id}`)

// ── Corrections ───────────────────────────────────────────────────
export const getCorrections    = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return request('GET', `/corrections${qs ? '?' + qs : ''}`)
}
export const getMyCorrections  = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return request('GET', `/corrections/me${qs ? '?' + qs : ''}`)
}
export const createCorrection  = (body)       => request('POST',  '/corrections', body)
export const createMyCorrection = (body)      => request('POST',  '/corrections/me', body)
export const approveCorrection = (id, notes)  => request('PATCH', `/corrections/${id}/approve`, { notes })
export const rejectCorrection  = (id, notes)  => request('PATCH', `/corrections/${id}/reject`,  { notes })

// ── Tenant ────────────────────────────────────────────────────────
export const getTenants           = ()          => request('GET',   '/tenants')
export const createTenant         = (body)      => request('POST',  '/tenants', body)
export const updateTenant         = (id, body)  => request('PATCH', `/tenants/${id}`, body)
export const getTenantSettings    = ()          => request('GET',   '/tenants/current')
export const updateTenantSettings = (body)      => request('PATCH', '/tenants/current', body)

// ── Payroll Runs ──────────────────────────────────────────────────
export const getPayrollRuns     = ()     => request('GET',   '/payroll')
export const getPayrollRun      = (id)   => request('GET',   `/payroll/${id}`)
export const getMyPayslips      = ()     => request('GET',   '/payroll/me/payslips')
export const createPayrollRun   = (body) => request('POST',  '/payroll', body)
export const computePayrollRun  = (id)   => request('POST',  `/payroll/${id}/compute`)
export const submitPayrollRun   = (id)   => request('PATCH', `/payroll/${id}/submit`)
export const approvePayrollRun  = (id)   => request('PATCH', `/payroll/${id}/approve`)
export const finalizePayrollRun = (id)   => request('PATCH', `/payroll/${id}/finalize`)
export const deletePayrollRun   = (id)   => request('DELETE', `/payroll/${id}`)

export { getToken, saveToken, clearToken }
