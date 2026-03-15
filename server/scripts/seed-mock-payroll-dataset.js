require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const mongoose = require('mongoose')
const Tenant = require('../models/Tenant')
const Branch = require('../models/Branch')
const Employee = require('../models/Employee')
const EmployeeDocument = require('../models/EmployeeDocument')
const SalaryStructure = require('../models/SalaryStructure')
const AttendanceLog = require('../models/AttendanceLog')
const Schedule = require('../models/Schedule')

const RANGE_START = '2026-03-01'
const RANGE_END = '2026-03-15'

const MOCK_EMPLOYEES = [
  {
    employeeCode: 'MOCK-001',
    firstName: 'Aira',
    lastName: 'Dela Cruz',
    position: 'Cashier',
    salary: {
      salaryType: 'monthly',
      basicRate: 22000,
      allowances: [{ name: 'Rice Allowance', type: 'fixed_monthly', amount: 1500, isTaxable: false }],
      additionalDeductions: [{ name: 'Uniform', category: 'company', subType: 'uniform', amount: 150 }],
      overtimeEligible: true,
      nightDiffEligible: false,
    },
  },
  {
    employeeCode: 'MOCK-002',
    firstName: 'Ben',
    lastName: 'Santos',
    position: 'Front Desk',
    salary: {
      salaryType: 'monthly',
      basicRate: 18500,
      allowances: [{ name: 'Transport', type: 'fixed_monthly', amount: 1000, isTaxable: false }],
      additionalDeductions: [],
      overtimeEligible: true,
      nightDiffEligible: false,
    },
  },
  {
    employeeCode: 'MOCK-003',
    firstName: 'Cara',
    lastName: 'Reyes',
    position: 'Inventory Clerk',
    salary: {
      salaryType: 'daily',
      basicRate: 780,
      allowances: [{ name: 'Meal', type: 'per_day', amount: 60, isTaxable: false }],
      additionalDeductions: [{ name: 'Cash Advance', category: 'loan', subType: 'cash_advance', amount: 250 }],
      overtimeEligible: true,
      nightDiffEligible: false,
    },
  },
  {
    employeeCode: 'MOCK-004',
    firstName: 'Diego',
    lastName: 'Navarro',
    position: 'Warehouse Lead',
    salary: {
      salaryType: 'hourly',
      basicRate: 95,
      allowances: [{ name: 'Hazard', type: 'per_hour', amount: 10, isTaxable: true }],
      additionalDeductions: [{ name: 'Loan Repayment', category: 'loan', subType: 'loan', amount: 300 }],
      overtimeEligible: true,
      nightDiffEligible: true,
    },
  },
  {
    employeeCode: 'MOCK-005',
    firstName: 'Elle',
    lastName: 'Mendoza',
    position: 'Admin Assistant',
    salary: {
      salaryType: 'monthly',
      basicRate: 20000,
      allowances: [{ name: 'Communication', type: 'fixed_monthly', amount: 800, isTaxable: false }],
      additionalDeductions: [{ name: 'Savings Program', category: 'company', subType: 'savings', amount: 200 }],
      overtimeEligible: true,
      nightDiffEligible: false,
    },
  },
]

function manilaDateTime(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00+08:00`)
}

function* eachDate(startStr, endStr) {
  const current = new Date(`${startStr}T00:00:00+08:00`)
  const end = new Date(`${endStr}T00:00:00+08:00`)

  while (current <= end) {
    const year = current.getUTCFullYear()
    const month = String(current.getUTCMonth() + 1).padStart(2, '0')
    const day = String(current.getUTCDate()).padStart(2, '0')
    yield `${year}-${month}-${day}`
    current.setUTCDate(current.getUTCDate() + 1)
  }
}

function getManilaDayOfWeek(dateStr) {
  return new Date(`${dateStr}T12:00:00+08:00`).getUTCDay()
}

function shouldSkipWeekend(dateStr) {
  const day = getManilaDayOfWeek(dateStr)
  return day === 0 || day === 6
}

function dateIn(dateStr, values) {
  return values.includes(dateStr)
}

function buildDayPattern(employeeCode, dateStr, weekdayIndex) {
  if (employeeCode === 'MOCK-001') {
    const overtimeDays = ['2026-03-05', '2026-03-11']
    if (dateIn(dateStr, overtimeDays)) return { in: '07:55', out: '18:35' }
    return { in: '07:58', out: '17:06' }
  }

  if (employeeCode === 'MOCK-002') {
    const lateDays = ['2026-03-03', '2026-03-06', '2026-03-10', '2026-03-12', '2026-03-13']
    if (dateIn(dateStr, lateDays)) return { in: '08:24', out: '17:01' }
    return { in: '08:03', out: '17:03' }
  }

  if (employeeCode === 'MOCK-003') {
    const absences = ['2026-03-09']
    if (dateIn(dateStr, absences)) return null

    const undertimeDays = ['2026-03-06', '2026-03-12']
    if (dateIn(dateStr, undertimeDays)) return { in: '08:03', out: '16:35' }

    return weekdayIndex % 4 === 0 ? { in: '08:05', out: '17:22' } : { in: '08:04', out: '17:04' }
  }

  if (employeeCode === 'MOCK-004') {
    const lateDays = ['2026-03-03', '2026-03-10']
    if (dateIn(dateStr, lateDays)) return { in: '08:18', out: '17:18' }

    const overtimeDays = ['2026-03-05', '2026-03-11']
    if (dateIn(dateStr, overtimeDays)) return { in: '08:00', out: '18:10' }

    return { in: '08:02', out: '17:07' }
  }

  if (employeeCode === 'MOCK-005') {
    // One missing OUT to test exception behavior.
    if (dateStr === '2026-03-11') return { in: '08:07', out: null }

    const lightOvertimeDays = ['2026-03-05', '2026-03-13']
    if (dateIn(dateStr, lightOvertimeDays)) return { in: '08:01', out: '17:48' }

    return { in: '08:04', out: '17:00' }
  }

  return { in: '08:00', out: '17:00' }
}

function makeLog({ tenantId, branchId, employeeId, timestamp, type, notes }) {
  return {
    tenantId,
    branchId,
    employeeId,
    timestamp,
    type,
    source: 'admin_correction',
    synced: true,
    syncedAt: new Date(),
    notes,
  }
}

async function ensureTenantAndBranch() {
  let tenant = await Tenant.findOne({ code: 'DEWEBNET' }).lean()
  if (!tenant) {
    tenant = await Tenant.create({
      name: 'DE WEBNET Demo Company',
      code: 'DEWEBNET',
      contactEmail: 'admin@dewebnet.com',
      subscription: { plan: 'enterprise', maxEmployees: 500, maxBranches: 10, isActive: true },
      settings: {
        timezone: 'Asia/Manila',
        gracePeriodMinutes: 5,
        overtimeMultipliers: {
          regular: 1.25,
          restDay: 1.30,
          specialHoliday: 1.30,
          regularHoliday: 2.0,
          nightDiff: 0.1,
        },
        nightDiffWindow: { start: '22:00', end: '06:00' },
      },
      isActive: true,
    })
    tenant = tenant.toObject()
  }

  let branch = await Branch.findOne({ tenantId: tenant._id, isActive: true }).sort({ createdAt: 1 }).lean()
  if (!branch) {
    branch = await Branch.create({
      tenantId: tenant._id,
      name: 'Main Branch',
      code: 'MAIN',
      address: 'Demo Address',
      timezone: 'Asia/Manila',
      isActive: true,
    })
    branch = branch.toObject()
  }

  return { tenant, branch }
}

async function ensureMockSchedule(tenantId) {
  let schedule = await Schedule.findOne({ tenantId, code: 'MOCK_DAYSHIFT' }).lean()
  if (!schedule) {
    schedule = await Schedule.create({
      tenantId,
      name: 'Mock Day Shift (Mon-Fri)',
      code: 'MOCK_DAYSHIFT',
      type: 'fixed',
      shiftStart: '08:00',
      shiftEnd: '17:00',
      breakDurationMinutes: 60,
      isPaidBreak: false,
      gracePeriodMinutes: 5,
      undertimePolicyMinutes: 0,
      roundingRuleMinutes: 0,
      allowMultiplePunches: false,
      restDays: [0, 6],
      isActive: true,
    })
    return schedule.toObject()
  }

  await Schedule.findByIdAndUpdate(schedule._id, {
    name: 'Mock Day Shift (Mon-Fri)',
    code: 'MOCK_DAYSHIFT',
    type: 'fixed',
    shiftStart: '08:00',
    shiftEnd: '17:00',
    breakDurationMinutes: 60,
    isPaidBreak: false,
    gracePeriodMinutes: 5,
    undertimePolicyMinutes: 0,
    roundingRuleMinutes: 0,
    allowMultiplePunches: false,
    restDays: [0, 6],
    isActive: true,
  })

  return Schedule.findById(schedule._id).lean()
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)

  const { tenant, branch } = await ensureTenantAndBranch()
  const schedule = await ensureMockSchedule(tenant._id)
  const mockCodes = MOCK_EMPLOYEES.map((entry) => entry.employeeCode)

  const existingEmployees = await Employee.find({
    tenantId: tenant._id,
    employeeCode: { $in: mockCodes },
  })
    .select('_id employeeCode')
    .lean()

  const existingIds = existingEmployees.map((employee) => employee._id)

  if (existingIds.length) {
    await AttendanceLog.deleteMany({ employeeId: { $in: existingIds } })
    await EmployeeDocument.deleteMany({ employeeId: { $in: existingIds } })
    await SalaryStructure.deleteMany({ employeeId: { $in: existingIds } })
    await Employee.deleteMany({ _id: { $in: existingIds } })
  }

  const employees = await Employee.insertMany(
    MOCK_EMPLOYEES.map((entry, index) => ({
      tenantId: tenant._id,
      branchId: branch._id,
      employeeCode: entry.employeeCode,
      firstName: entry.firstName,
      lastName: entry.lastName,
      email: `${entry.employeeCode.toLowerCase()}@dewebnet.local`,
      contactNumber: `09${String(100000000 + index * 11111111).slice(0, 9)}`,
      address: 'Mock City, PH',
      employment: {
        status: 'active',
        type: index % 2 === 0 ? 'regular' : 'probationary',
        dateHired: new Date('2025-11-01T00:00:00+08:00'),
        position: entry.position,
      },
      taxStatus: 'S',
      dependents: index % 3,
      scheduleId: schedule._id,
      isActive: true,
    })),
  )

  await SalaryStructure.insertMany(
    employees.map((employee, index) => {
      const template = MOCK_EMPLOYEES[index].salary
      return {
        tenantId: tenant._id,
        employeeId: employee._id,
        salaryType: template.salaryType,
        basicRate: template.basicRate,
        paymentFrequency: 'semi_monthly',
        allowances: template.allowances,
        additionalDeductions: template.additionalDeductions,
        overtimeEligible: template.overtimeEligible,
        nightDiffEligible: template.nightDiffEligible,
        effectiveDate: new Date('2026-01-01T00:00:00+08:00'),
        isActive: true,
      }
    }),
  )

  const attendanceLogs = []
  const seededWorkingDays = []

  for (const employee of employees) {
    let weekdayIndex = 0

    for (const dateStr of eachDate(RANGE_START, RANGE_END)) {
      if (shouldSkipWeekend(dateStr)) continue

      const pattern = buildDayPattern(employee.employeeCode, dateStr, weekdayIndex)
      weekdayIndex += 1

      if (!pattern) continue

      attendanceLogs.push(
        makeLog({
          tenantId: tenant._id,
          branchId: branch._id,
          employeeId: employee._id,
          timestamp: manilaDateTime(dateStr, pattern.in),
          type: 'IN',
          notes: 'Mock payroll dataset IN',
        }),
      )

      if (pattern.out) {
        const outDateStr = pattern.out < pattern.in ? (() => {
          const date = new Date(`${dateStr}T00:00:00+08:00`)
          date.setUTCDate(date.getUTCDate() + 1)
          const year = date.getUTCFullYear()
          const month = String(date.getUTCMonth() + 1).padStart(2, '0')
          const day = String(date.getUTCDate()).padStart(2, '0')
          return `${year}-${month}-${day}`
        })() : dateStr

        attendanceLogs.push(
          makeLog({
            tenantId: tenant._id,
            branchId: branch._id,
            employeeId: employee._id,
            timestamp: manilaDateTime(outDateStr, pattern.out),
            type: 'OUT',
            notes: 'Mock payroll dataset OUT',
          }),
        )
      }

      seededWorkingDays.push({ employeeCode: employee.employeeCode, date: dateStr, pattern })
    }
  }

  if (attendanceLogs.length > 0) {
    await AttendanceLog.insertMany(attendanceLogs)
  }

  console.log(
    JSON.stringify(
      {
        tenant: { id: tenant._id, code: tenant.code },
        branch: { id: branch._id, name: branch.name, code: branch.code },
        range: [RANGE_START, RANGE_END],
        employeesCreated: employees.length,
        salaryStructuresCreated: employees.length,
        attendanceLogsCreated: attendanceLogs.length,
        sample: seededWorkingDays.slice(0, 8),
        employees: employees.map((employee) => ({
          employeeCode: employee.employeeCode,
          name: `${employee.firstName} ${employee.lastName}`,
        })),
        schedule: {
          id: schedule._id,
          code: schedule.code,
          restDays: schedule.restDays,
        },
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await mongoose.disconnect()
    } catch {
      // ignore disconnect errors for one-off seed script
    }
  })
