/**
 * Seed script — creates initial super_admin + demo tenant if they don't exist.
 * Run once: node scripts/seed.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') })
const mongoose  = require('mongoose')
const bcrypt    = require('bcryptjs')
const User      = require('../models/User')
const Tenant    = require('../models/Tenant')

async function seed() {
  console.log('Connecting to MongoDB…')
  await mongoose.connect(process.env.MONGODB_URI)
  console.log('Connected.')

  // ── Tenant ─────────────────────────────────────────────────────────────────
  let tenant = await Tenant.findOne({ code: 'APOLLO' })
  if (!tenant) {
    tenant = await Tenant.create({
      name: 'Apollo Demo Company',
      code: 'APOLLO',
      contactEmail: 'admin@apollo.com',
      subscription: { plan: 'enterprise', maxEmployees: 500, maxBranches: 10, isActive: true },
      settings: {
        timezone: 'Asia/Manila',
        gracePeriodMinutes: 5,
        overtimeMultipliers: {
          regular: 1.25, restDay: 1.30, specialHoliday: 1.30, regularHoliday: 2.00, nightDiff: 0.10
        },
        nightDiffWindow: { start: '22:00', end: '06:00' }
      }
    })
    console.log('✅ Tenant created: APOLLO')
  } else {
    console.log('ℹ️  Tenant already exists: APOLLO (id=' + tenant._id + ')')
  }

  // ── Super Admin ────────────────────────────────────────────────────────────
  const superEmail = 'admin@apollo.com'
  let superUser = await User.findOne({ email: superEmail })
  if (!superUser) {
    const passwordHash = await bcrypt.hash('admin123', 12)
    superUser = await User.create({
      tenantId:     tenant._id,
      email:        superEmail,
      passwordHash,
      role:         'super_admin',
      firstName:    'Apollo',
      lastName:     'Admin',
      isActive:     true
    })
    console.log('✅ Super admin created: admin@apollo.com / admin123')
  } else {
    console.log('ℹ️  Super admin already exists:', superEmail)
    // Fix role if needed
    if (superUser.role !== 'super_admin') {
      await User.findByIdAndUpdate(superUser._id, { role: 'super_admin' })
      console.log('   → updated role to super_admin')
    }
    // Reset password
    const passwordHash = await bcrypt.hash('admin123', 12)
    await User.findByIdAndUpdate(superUser._id, { passwordHash, isActive: true, tenantId: tenant._id })
    console.log('   → password reset to admin123')
  }

  console.log('\n═══════════════════════════════════')
  console.log('Seed complete!')
  console.log('  Login:    http://localhost:5173/login')
  console.log('  Email:    admin@apollo.com')
  console.log('  Password: admin123')
  console.log('  Tenant code (kiosk): APOLLO')
  console.log('═══════════════════════════════════\n')

  await mongoose.disconnect()
}

seed().catch(err => { console.error(err); process.exit(1) })
