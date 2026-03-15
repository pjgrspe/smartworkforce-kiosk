require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const mongoose = require('mongoose')
const Employee = require('../models/Employee')
const EmployeeDocument = require('../models/EmployeeDocument')
const AttendanceLog = require('../models/AttendanceLog')

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)

  const before = {
    employees: await Employee.countDocuments({}),
    employeeDocuments: await EmployeeDocument.countDocuments({}),
    attendanceLogs: await AttendanceLog.countDocuments({}),
  }

  const employeeDelete = await Employee.deleteMany({})
  const documentDelete = await EmployeeDocument.deleteMany({})
  const attendanceDelete = await AttendanceLog.deleteMany({})

  const after = {
    employees: await Employee.countDocuments({}),
    employeeDocuments: await EmployeeDocument.countDocuments({}),
    attendanceLogs: await AttendanceLog.countDocuments({}),
  }

  console.log(
    JSON.stringify(
      {
        before,
        deleted: {
          employees: employeeDelete.deletedCount,
          employeeDocuments: documentDelete.deletedCount,
          attendanceLogs: attendanceDelete.deletedCount,
        },
        after,
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
      // ignore disconnect errors for one-off script
    }
  })
