require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const mongoose = require('mongoose')
const User = require('../models/User')
const Branch = require('../models/Branch')

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)

  const users = await User.find({ tenantId: null, branchId: { $ne: null } })
  let updated = 0

  for (const user of users) {
    const branch = await Branch.findById(user.branchId).select('tenantId name').lean()
    if (!branch?.tenantId) continue

    user.tenantId = branch.tenantId
    await user.save()
    updated += 1
    console.log(`FIXED ${user.email} -> ${branch.name}`)
  }

  console.log(`UPDATED_COUNT=${updated}`)
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
      // ignore disconnect failures in one-off maintenance script
    }
  })
