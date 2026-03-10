#!/usr/bin/env node
/**
 * Apollo API Test Suite
 * Run from anywhere: node scripts/test.js
 *
 * Coverage:
 *  ✔  Health check
 *  ✔  Auth (login, bad credentials, protected route without token)
 *  ✔  Tenants (current, list)
 *  ✔  Branches (create, list, update, delete)
 *  ✔  Departments (create, list, delete)
 *  ✔  Schedules (create, list, delete)
 *  ✔  Employees (create, list, delete)
 *  ✔  Users (list)
 *  ✔  Holidays (create, bulk seed, list, delete)
 *  ✔  Corrections (create, list)
 *  ✔  Payroll (create run, list)
 *  ✔  Kiosk (public — no token: employees, recent, punch)
 *  ✔  Attendance (list)
 */

const http = require('http')
const https = require('https')

// ── Config ────────────────────────────────────────────────────────────────────
const BASE     = process.env.API_URL  || 'http://localhost:3000'
const EMAIL    = process.env.EMAIL    || 'admin@apollo.com'
const PASSWORD = process.env.PASSWORD || 'admin123'
const TENANT   = process.env.TENANT   || 'APOLLO'

// ── Tiny HTTP client ──────────────────────────────────────────────────────────
function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url    = new URL(BASE + path)
    const lib    = url.protocol === 'https:' ? https : http
    const json   = body ? JSON.stringify(body) : null
    const headers = { 'Content-Type': 'application/json' }
    if (token)  headers['Authorization'] = `Bearer ${token}`
    if (json)   headers['Content-Length'] = Buffer.byteLength(json)

    const req = lib.request(url, { method, headers }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      })
    })
    req.on('error', reject)
    if (json) req.write(json)
    req.end()
  })
}

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0
const failures = []
const start = Date.now()

function result(name, ok, detail = '') {
  if (ok) {
    passed++
    console.log(`  ✅  ${name}${detail ? '  ('+detail+')' : ''}`)
  } else {
    failed++
    failures.push({ name, detail })
    console.log(`  ❌  ${name}${detail ? '\n       → '+detail : ''}`)
  }
}

function skip(name, reason) {
  skipped++
  console.log(`  ⏭️   ${name}  [skipped: ${reason}]`)
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`)
}

// ── Tests ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n🚀  Apollo API Test Suite`)
  console.log(`    Target: ${BASE}`)
  console.log(`    User:   ${EMAIL}`)
  console.log(`    Tenant: ${TENANT}\n`)

  let token, tenantId, branchId, deptId, schedId, empId, holidayId, corrId, payrollRunId

  // ── 1. Health ──────────────────────────────────────────────────────────────
  section('Health')
  try {
    const r = await request('GET', '/api/health')
    result('GET /api/health', r.status === 200 && r.body.status === 'ok', `status=${r.body.status}`)
  } catch (e) {
    result('GET /api/health', false, e.message + ' — is the server running on ' + BASE + '?')
    console.log('\n⛔  Server unreachable. Start it first:\n    cd Apollo/server && node index.js\n')
    process.exit(1)
  }

  // ── 2. Auth ────────────────────────────────────────────────────────────────
  section('Auth')
  // Bad credentials
  {
    const r = await request('POST', '/api/auth/login', { email: EMAIL, password: 'wrong_password' })
    result('POST /api/auth/login — bad password returns 401', r.status === 401)
  }
  // Missing body
  {
    const r = await request('POST', '/api/auth/login', {})
    result('POST /api/auth/login — missing fields returns 400', r.status === 400)
  }
  // Good login
  {
    const r = await request('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD })
    const ok = r.status === 200 && r.body.token && r.body.user
    result('POST /api/auth/login — valid credentials', ok, ok ? `role=${r.body.user.role}` : JSON.stringify(r.body))
    if (ok) { token = r.body.token; tenantId = r.body.user.tenantId }
  }
  if (!token) {
    console.log('\n⛔  Login failed — run the seed script first:\n    node scripts/seed.js\n')
    process.exit(1)
  }
  // Protected route without token
  {
    const r = await request('GET', '/api/employees')
    result('GET /api/employees — no token returns 401', r.status === 401)
  }

  // ── 3. Tenants ─────────────────────────────────────────────────────────────
  section('Tenants')
  {
    const r = await request('GET', '/api/tenants/current', null, token)
    const ok = r.status === 200 && r.body.data
    result('GET /api/tenants/current', ok, ok ? `code=${r.body.data.code}` : JSON.stringify(r.body))
  }
  {
    const r = await request('GET', '/api/tenants', null, token)
    result('GET /api/tenants', r.status === 200, `count=${r.body.data?.length ?? '?'}`)
  }

  // ── 4. Branches ────────────────────────────────────────────────────────────
  section('Branches')
  {
    const r = await request('POST', '/api/branches', { name: 'Test Branch', code: 'TST', address: '123 Test St' }, token)
    const ok = r.status === 201 && r.body.data?._id
    result('POST /api/branches', ok, ok ? `id=${r.body.data._id}` : JSON.stringify(r.body))
    if (ok) branchId = r.body.data._id
  }
  {
    const r = await request('GET', '/api/branches', null, token)
    result('GET /api/branches', r.status === 200, `count=${r.body.data?.length ?? '?'}`)
  }
  if (branchId) {
    const r = await request('PATCH', `/api/branches/${branchId}`, { name: 'Test Branch (updated)' }, token)
    result('PATCH /api/branches/:id', r.status === 200)
  } else skip('PATCH /api/branches/:id', 'create failed')

  // ── 5. Departments ─────────────────────────────────────────────────────────
  section('Departments')
  {
    const r = await request('POST', '/api/departments', { name: 'Test Dept', code: 'TDPT', branchId }, token)
    const ok = r.status === 201 && r.body.data?._id
    result('POST /api/departments', ok, ok ? `id=${r.body.data._id}` : JSON.stringify(r.body))
    if (ok) deptId = r.body.data._id
  }
  {
    const r = await request('GET', '/api/departments', null, token)
    result('GET /api/departments', r.status === 200, `count=${r.body.data?.length ?? '?'}`)
  }

  // ── 6. Schedules ───────────────────────────────────────────────────────────
  section('Schedules')
  {
    const r = await request('POST', '/api/schedules', {
      name: 'Standard', code: 'STD', type: 'fixed',
      shiftStart: '08:00', shiftEnd: '17:00',
      breakDurationMinutes: 60, gracePeriodMinutes: 5, restDays: [0, 6]
    }, token)
    const ok = r.status === 201 && r.body.data?._id
    result('POST /api/schedules', ok, ok ? `id=${r.body.data._id}` : JSON.stringify(r.body))
    if (ok) schedId = r.body.data._id
  }
  {
    const r = await request('GET', '/api/schedules', null, token)
    result('GET /api/schedules', r.status === 200, `count=${r.body.data?.length ?? '?'}`)
  }

  // ── 7. Employees ───────────────────────────────────────────────────────────
  section('Employees')
  if (branchId) {
    {
      const r = await request('POST', '/api/employees', {
        employeeCode: `TEST-${Date.now().toString().slice(-5)}`,
        firstName: 'Test', lastName: 'Employee',
        email: `test.${Date.now()}@apollo.com`,
        branchId,
        employment: { status: 'active', type: 'regular', position: 'Tester', dateHired: '2025-01-01' }
      }, token)
      const ok = r.status === 201 && r.body.data?._id
      result('POST /api/employees', ok, ok ? `id=${r.body.data._id}` : JSON.stringify(r.body))
      if (ok) empId = r.body.data._id
    }
    {
      const r = await request('GET', '/api/employees', null, token)
      result('GET /api/employees', r.status === 200, `count=${r.body.data?.length ?? '?'}`)
    }
    if (empId) {
      const r = await request('PATCH', `/api/employees/${empId}`, { 'employment.position': 'Senior Tester' }, token)
      result('PATCH /api/employees/:id', r.status === 200)
    } else skip('PATCH /api/employees/:id', 'create failed')
  } else {
    skip('POST /api/employees', 'no branchId')
    skip('GET /api/employees', 'no branchId')
    skip('PATCH /api/employees/:id', 'no branchId')
  }

  // ── 8. Salary (requires employee) ─────────────────────────────────────────
  section('Salary')
  if (empId) {
    const r = await request('POST', '/api/salary', {
      employeeId: empId,
      salaryType: 'monthly',
      basicRate: 25000,
      paymentFrequency: 'semi_monthly',
      isOvertimeEligible: true,
      isNightDiffEligible: false
    }, token)
    result('POST /api/salary', r.status === 201, JSON.stringify(r.body.data?._id || r.body.error || ''))
  } else skip('POST /api/salary', 'no empId')

  // ── 9. Users ───────────────────────────────────────────────────────────────
  section('Users')
  {
    const r = await request('GET', '/api/users', null, token)
    result('GET /api/users', r.status === 200, `count=${r.body.data?.length ?? '?'}`)
  }

  // ── 10. Holidays ───────────────────────────────────────────────────────────
  section('Holidays')
  {
    const r = await request('POST', '/api/holidays', {
      name: 'Test Holiday', date: '2026-12-25', type: 'regular'
    }, token)
    const ok = r.status === 201 && r.body.data?._id
    result('POST /api/holidays', ok, ok ? `id=${r.body.data._id}` : JSON.stringify(r.body))
    if (ok) holidayId = r.body.data._id
  }
  {
    const r = await request('GET', '/api/holidays?year=2026', null, token)
    result('GET /api/holidays?year=2026', r.status === 200, `count=${r.body.data?.length ?? '?'}`)
  }

  // ── 11. Corrections ───────────────────────────────────────────────────────
  section('Corrections')
  if (empId) {
    {
      const r = await request('POST', '/api/corrections', {
        employeeId: empId,
        date: new Date().toISOString().slice(0, 10),
        reason: 'Forgot to time in',
        notes: 'Test correction from test suite'
      }, token)
      const ok = r.status === 201 && r.body.data?._id
      result('POST /api/corrections', ok, ok ? `id=${r.body.data._id}` : JSON.stringify(r.body))
      if (ok) corrId = r.body.data._id
    }
    {
      const r = await request('GET', '/api/corrections', null, token)
      result('GET /api/corrections', r.status === 200, `count=${r.body.data?.length ?? '?'}`)
    }
    if (corrId) {
      const r = await request('PATCH', `/api/corrections/${corrId}/approve`, { notes: 'Approved by test' }, token)
      result('PATCH /api/corrections/:id/approve', r.status === 200)
    }
  } else {
    skip('POST /api/corrections', 'no empId')
    skip('GET /api/corrections', 'no empId')
    skip('PATCH /api/corrections/:id/approve', 'no empId')
  }

  // ── 12. Payroll ────────────────────────────────────────────────────────────
  section('Payroll')
  {
    const r = await request('POST', '/api/payroll', {
      cutoffStart: '2026-03-01', cutoffEnd: '2026-03-15', notes: 'Test run'
    }, token)
    const ok = r.status === 201 && r.body.data?._id
    result('POST /api/payroll (create run)', ok, ok ? `id=${r.body.data._id}` : JSON.stringify(r.body))
    if (ok) payrollRunId = r.body.data._id
  }
  {
    const r = await request('GET', '/api/payroll', null, token)
    result('GET /api/payroll', r.status === 200, `count=${r.body.data?.length ?? '?'}`)
  }
  if (payrollRunId) {
    // Compute
    const rc = await request('POST', `/api/payroll/${payrollRunId}/compute`, {}, token)
    result('POST /api/payroll/:id/compute', rc.status === 200, rc.body.data?.payslipItems ? `${rc.body.data.payslipItems.length} payslip(s)` : JSON.stringify(rc.body.error || ''))
    // Submit
    const rs = await request('PATCH', `/api/payroll/${payrollRunId}/submit`, {}, token)
    result('PATCH /api/payroll/:id/submit', rs.status === 200)
    // Approve
    const ra = await request('PATCH', `/api/payroll/${payrollRunId}/approve`, {}, token)
    result('PATCH /api/payroll/:id/approve', ra.status === 200)
  } else {
    skip('POST /api/payroll/:id/compute', 'create failed')
    skip('PATCH /api/payroll/:id/submit', 'create failed')
    skip('PATCH /api/payroll/:id/approve', 'create failed')
  }

  // ── 13. Attendance ────────────────────────────────────────────────────────
  section('Attendance')
  {
    const r = await request('GET', `/api/attendance?start_date=2026-03-01&end_date=2026-03-31`, null, token)
    result('GET /api/attendance (date range)', r.status === 200, `count=${r.body.data?.length ?? '?'}`)
  }
  if (empId) {
    const r = await request('POST', '/api/attendance', {
      employeeId: empId, branchId,
      type: 'IN', timestamp: new Date().toISOString(), source: 'admin_correction'
    }, token)
    result('POST /api/attendance (manual log)', r.status === 201)
  } else skip('POST /api/attendance', 'no empId')

  // ── 14. Kiosk (public — no JWT) ───────────────────────────────────────────
  section('Kiosk (public — no auth)')
  {
    const r = await request('GET', `/api/kiosk/employees?tenant=${TENANT}`)
    result(`GET /api/kiosk/employees?tenant=${TENANT}`, r.status === 200,
      `count=${r.body.data?.length ?? '?'}, enrolled=${r.body.data?.filter(e => e.faceData?.faceApiDescriptors?.length > 0).length ?? 0}`)
  }
  {
    const r = await request('GET', `/api/kiosk/recent?tenant=${TENANT}`)
    result(`GET /api/kiosk/recent?tenant=${TENANT}`, r.status === 200, `count=${r.body.data?.length ?? '?'}`)
  }
  {
    const r = await request('GET', `/api/kiosk/employees?tenant=INVALID_TENANT_XYZ`)
    result('GET /api/kiosk/employees — invalid tenant returns 404', r.status === 404)
  }
  if (empId) {
    const r = await request('POST', '/api/kiosk/punch', {
      tenant: TENANT, employeeId: empId, type: 'IN', confidenceScore: 0.92
    })
    result('POST /api/kiosk/punch', r.status === 201,
      r.body.data?.type ? `type=${r.body.data.type}` : JSON.stringify(r.body.error || ''))
  } else skip('POST /api/kiosk/punch', 'no empId')

  // ── Clean up — delete test data ────────────────────────────────────────────
  section('Cleanup')
  if (empId) {
    const r = await request('DELETE', `/api/employees/${empId}`, null, token)
    result('DELETE /api/employees (test employee)', r.status === 200)
  }
  if (holidayId) {
    const r = await request('DELETE', `/api/holidays/${holidayId}`, null, token)
    result('DELETE /api/holidays (test holiday)', r.status === 200)
  }
  if (deptId) {
    const r = await request('DELETE', `/api/departments/${deptId}`, null, token)
    result('DELETE /api/departments (test dept)', r.status === 200)
  }
  if (schedId) {
    const r = await request('DELETE', `/api/schedules/${schedId}`, null, token)
    result('DELETE /api/schedules (test schedule)', r.status === 200)
  }
  if (branchId) {
    const r = await request('DELETE', `/api/branches/${branchId}`, null, token)
    result('DELETE /api/branches (test branch)', r.status === 200)
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - start) / 1000).toFixed(2)
  console.log(`\n${'═'.repeat(52)}`)
  console.log(`  Results:  ✅ ${passed} passed   ❌ ${failed} failed   ⏭️  ${skipped} skipped`)
  console.log(`  Duration: ${elapsed}s`)

  if (failures.length > 0) {
    console.log('\n  Failed tests:')
    failures.forEach(f => console.log(`    ❌  ${f.name}\n        ${f.detail}`))
  }

  console.log(`${'═'.repeat(52)}\n`)
  process.exit(failed > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('\n⛔  Unexpected error:', err.message)
  process.exit(1)
})
