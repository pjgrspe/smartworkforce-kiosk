require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const mongoose = require('mongoose')
const Employee = require('../models/Employee')
const SalaryStructure = require('../models/SalaryStructure')
const AttendanceLog = require('../models/AttendanceLog')
const { computeEmployeeTime } = require('../services/time-engine')
const { computePayslip } = require('../services/payroll-engine')

const START = new Date('2026-03-01')
const END = new Date('2026-03-15')
const END_WITH_BUFFER = new Date('2026-03-16')

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)

  const employees = await Employee.find({
    firstName: { $in: ['Jason', 'Patrick'] },
    isActive: true,
  }).lean()

  for (const employee of employees) {
    const salary = await SalaryStructure.findOne({ employeeId: employee._id, isActive: true }).lean()
    const logs = await AttendanceLog.find({
      employeeId: employee._id,
      timestamp: { $gte: START, $lte: END_WITH_BUFFER },
    }).sort('timestamp').lean()

    const timeSummary = await computeEmployeeTime(String(employee._id), START, END, {})
    const payslip = await computePayslip(timeSummary, {})

    console.log(JSON.stringify({
      employee: {
        id: String(employee._id),
        code: employee.employeeCode,
        name: `${employee.firstName} ${employee.lastName}`,
        branchId: employee.branchId,
        scheduleId: employee.scheduleId,
      },
      salary: salary ? {
        basicRate: salary.basicRate,
        salaryType: salary.salaryType,
        paymentFrequency: salary.paymentFrequency,
        overtimeEligible: salary.overtimeEligible,
        nightDiffEligible: salary.nightDiffEligible,
      } : null,
      logCount: logs.length,
      firstLogs: logs.slice(0, 6).map((log) => ({
        type: log.type,
        timestamp: log.timestamp,
      })),
      timeSummary: {
        totalWorkedMinutes: timeSummary.totalWorkedMinutes,
        totalLateMinutes: timeSummary.totalLateMinutes,
        totalUndertimeMinutes: timeSummary.totalUndertimeMinutes,
        totalOvertimeMinutes: timeSummary.totalOvertimeMinutes,
        totalNightDiffMinutes: timeSummary.totalNightDiffMinutes,
        absentDays: timeSummary.absentDays,
        regularHolidayDays: timeSummary.regularHolidayDays,
        specialHolidayDays: timeSummary.specialHolidayDays,
        daysSample: timeSummary.days.slice(0, 8),
      },
      payslip,
    }, null, 2))
  }
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
      // ignore disconnect errors for one-off diagnostics
    }
  })