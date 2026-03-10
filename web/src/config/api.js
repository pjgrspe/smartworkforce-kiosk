/**
 * HTTP API Client
 * Thin wrapper around fetch that attaches the stored JWT.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

function getToken() {
  return localStorage.getItem('apollo_token')
}

function saveToken(token) {
  localStorage.setItem('apollo_token', token)
}

function clearToken() {
  localStorage.removeItem('apollo_token')
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })

  if (res.status === 401) {
    clearToken()
    window.location.href = '/login'
    return
  }

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }

  return data
}

// ── Auth ──────────────────────────────────────────────────────────
export async function login(email, password) {
  const data = await request('POST', '/auth/login', { email, password })
  saveToken(data.token)
  return data
}

export function logout() {
  clearToken()
}

// ── Employees ─────────────────────────────────────────────────────
export const getEmployees   = ()         => request('GET',    '/employees')
export const getEmployee    = (id)       => request('GET',    `/employees/${id}`)
export const createEmployee = (payload)  => request('POST',   '/employees', payload)
export const updateEmployee  = (id, body)        => request('PATCH',  `/employees/${id}`, body)
export const deleteEmployee  = (id)              => request('DELETE', `/employees/${id}`)
export const enrollFace      = (id, descriptors) => request('PATCH',  `/employees/${id}/enroll-face`, { descriptors })

// ── Attendance ────────────────────────────────────────────────────
export const getAttendance = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return request('GET', `/attendance${qs ? '?' + qs : ''}`)
}
export const getTodayAttendance = () => request('GET', '/attendance/today')

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
export const createUser = (body)      => request('POST',   '/users', body)
export const updateUser = (id, body)  => request('PATCH',  `/users/${id}`, body)
export const deleteUser = (id)        => request('DELETE', `/users/${id}`)

// ── Salary Structures ─────────────────────────────────────────────
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
export const createCorrection  = (body)       => request('POST',  '/corrections', body)
export const approveCorrection = (id, notes)  => request('PATCH', `/corrections/${id}/approve`, { notes })
export const rejectCorrection  = (id, notes)  => request('PATCH', `/corrections/${id}/reject`,  { notes })

// ── Tenant ────────────────────────────────────────────────────────
export const getTenantSettings    = ()     => request('GET',   '/tenants/current')
export const updateTenantSettings = (body) => request('PATCH', '/tenants/current', body)

// ── Payroll Runs ──────────────────────────────────────────────────
export const getPayrollRuns     = ()     => request('GET',   '/payroll')
export const getPayrollRun      = (id)   => request('GET',   `/payroll/${id}`)
export const createPayrollRun   = (body) => request('POST',  '/payroll', body)
export const computePayrollRun  = (id)   => request('POST',  `/payroll/${id}/compute`)
export const submitPayrollRun   = (id)   => request('PATCH', `/payroll/${id}/submit`)
export const approvePayrollRun  = (id)   => request('PATCH', `/payroll/${id}/approve`)
export const finalizePayrollRun = (id)   => request('PATCH', `/payroll/${id}/finalize`)

export { getToken, saveToken, clearToken }
