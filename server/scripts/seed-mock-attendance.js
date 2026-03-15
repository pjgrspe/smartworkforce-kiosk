require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const mongoose = require('mongoose')
const AttendanceLog = require('../models/AttendanceLog')
const Employee = require('../models/Employee')

const RANGE_START = '2026-03-01'
const RANGE_END = '2026-03-15'

const TARGET_EMPLOYEES = [
  {
    firstName: 'Jason',
    lastName: 'Gorospe',
    legacyCodes: ['1234'],
    scheduleKey: 'jason-gorospe',
  },
  {
    firstName: 'Patrick',
    lastName: 'Santos',
    legacyCodes: ['123'],
    scheduleKey: 'patrick-santos',
  },
]

const MOCK_SCHEDULES = {
  'jason-gorospe': {
    defaultIn: '07:58',
    defaultOut: '17:06',
    lateDays: {
      '2026-03-03': { in: '08:12', out: '17:09' },
      '2026-03-10': { in: '08:21', out: '17:14' },
      '2026-03-14': { in: '08:08', out: '17:02' },
    },
  },
  'patrick-santos': {
    defaultIn: '08:03',
    defaultOut: '17:01',
    lateDays: {
      '2026-03-04': { in: '08:17', out: '17:03' },
      '2026-03-07': { in: '08:09', out: '17:08' },
      '2026-03-12': { in: '08:26', out: '17:11' },
      '2026-03-15': { in: '08:14', out: '17:05' },
    },
  },
}

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

function normalizeName(firstName, lastName) {
  return `${firstName || ''} ${lastName || ''}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function resolvePattern(employee) {
  const target = TARGET_EMPLOYEES.find((entry) => (
    normalizeName(entry.firstName, entry.lastName) === normalizeName(employee.firstName, employee.lastName)
      || entry.legacyCodes.includes(employee.employeeCode)
  ))

  return target ? MOCK_SCHEDULES[target.scheduleKey] : null
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)

  const employees = await Employee.find({
    isActive: true,
    $or: TARGET_EMPLOYEES.flatMap((entry) => ([
      { firstName: entry.firstName, lastName: entry.lastName },
      ...(entry.legacyCodes.length ? [{ employeeCode: { $in: entry.legacyCodes } }] : []),
    ])),
  })
    .select('_id employeeCode firstName lastName tenantId branchId')
    .lean()

  if (employees.length !== TARGET_EMPLOYEES.length) {
    throw new Error(`Expected ${TARGET_EMPLOYEES.length} active employees, found ${employees.length}`)
  }

  const employeeIds = employees.map((employee) => employee._id)
  await AttendanceLog.deleteMany({
    employeeId: { $in: employeeIds },
    timestamp: {
      $gte: manilaDateTime(RANGE_START, '00:00'),
      $lte: manilaDateTime(RANGE_END, '23:59'),
    },
  })

  const logs = []
  for (const employee of employees) {
    const pattern = resolvePattern(employee)
    if (!pattern) {
      throw new Error(`No mock attendance pattern configured for ${employee.firstName} ${employee.lastName} (${employee.employeeCode})`)
    }

    for (const dateStr of eachDate(RANGE_START, RANGE_END)) {
      const dayOfWeek = getManilaDayOfWeek(dateStr)
      if (dayOfWeek === 0 || dayOfWeek === 6) continue

      const override = pattern.lateDays[dateStr] || {}
      const inTime = override.in || pattern.defaultIn
      const outTime = override.out || pattern.defaultOut

      logs.push({
        tenantId: employee.tenantId,
        branchId: employee.branchId,
        employeeId: employee._id,
        timestamp: manilaDateTime(dateStr, inTime),
        type: 'IN',
        source: 'admin_correction',
        synced: true,
        syncedAt: new Date(),
        notes: 'Mock payroll test data',
      })

      logs.push({
        tenantId: employee.tenantId,
        branchId: employee.branchId,
        employeeId: employee._id,
        timestamp: manilaDateTime(dateStr, outTime),
        type: 'OUT',
        source: 'admin_correction',
        synced: true,
        syncedAt: new Date(),
        notes: 'Mock payroll test data',
      })
    }
  }

  await AttendanceLog.insertMany(logs)

  console.log(JSON.stringify({
    range: [RANGE_START, RANGE_END],
    employeeCount: employees.length,
    logCount: logs.length,
    employees: employees.map((employee) => ({
      employeeCode: employee.employeeCode,
      name: `${employee.firstName} ${employee.lastName}`,
    })),
  }, null, 2))
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
