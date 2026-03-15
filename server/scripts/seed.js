/**
 * Seed script — creates initial super_admin + demo tenant if they don't exist.
 * Run once: node scripts/seed.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') })
const mongoose  = require('mongoose')
const bcrypt    = require('bcryptjs')
const User      = require('../models/User')
const Tenant    = require('../models/Tenant')

const DEFAULT_PASSWORD = 'admin123'

const DEFAULT_ROLE_ACCOUNTS = [
  {
    email: 'admin@dewebnet.com',
    role: 'super_admin',
    firstName: 'DE WEBNET',
    lastName: 'Admin',
    tenantScoped: true,
  },
  {
    email: 'clientadmin@dewebnet.com',
    role: 'client_admin',
    firstName: 'Client',
    lastName: 'Admin',
    tenantScoped: true,
  },
  {
    email: 'hr@dewebnet.com',
    role: 'hr_payroll',
    firstName: 'HR',
    lastName: 'Payroll',
    tenantScoped: true,
  },
  {
    email: 'manager@dewebnet.com',
    role: 'branch_manager',
    firstName: 'Branch',
    lastName: 'Manager',
    tenantScoped: true,
  },
  {
    email: 'employee@dewebnet.com',
    role: 'employee',
    firstName: 'Demo',
    lastName: 'Employee',
    tenantScoped: true,
  },
  {
    email: 'auditor@dewebnet.com',
    role: 'auditor',
    firstName: 'System',
    lastName: 'Auditor',
    tenantScoped: true,
  },
]

async function upsertRoleAccount(account, tenant) {
  const existing = await User.findOne({ email: account.email })
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12)

  const payload = {
    tenantId: account.tenantScoped ? tenant._id : null,
    email: account.email,
    passwordHash,
    role: account.role,
    firstName: account.firstName,
    lastName: account.lastName,
    isActive: true,
  }

  if (!existing) {
    await User.create(payload)
    console.log(`✅ ${account.role} created: ${account.email} / ${DEFAULT_PASSWORD}`)
    return
  }

  await User.findByIdAndUpdate(existing._id, payload)
  console.log(`ℹ️  ${account.role} updated: ${account.email} (password reset to ${DEFAULT_PASSWORD})`)
}

async function seed() {
  console.log('Connecting to MongoDB…')
  await mongoose.connect(process.env.MONGODB_URI)
  console.log('Connected.')

  // ── Tenant ─────────────────────────────────────────────────────────────────
  let tenant = await Tenant.findOne({ code: 'DEWEBNET' })
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
          regular: 1.25, restDay: 1.30, specialHoliday: 1.30, regularHoliday: 2.00, nightDiff: 0.10
        },
        nightDiffWindow: { start: '22:00', end: '06:00' }
      }
    })
    console.log('✅ Tenant created: DE WEBNET')
  } else {
    console.log('ℹ️  Tenant already exists: DE WEBNET (id=' + tenant._id + ')')
  }

  // ── Default role accounts ──────────────────────────────────────────────────
  for (const account of DEFAULT_ROLE_ACCOUNTS) {
    await upsertRoleAccount(account, tenant)
  }

  console.log('\n═══════════════════════════════════')
  console.log('Seed complete!')
  console.log('  Login:    http://localhost:5173/login')
  console.log('  Default password for all seed accounts: admin123')
  DEFAULT_ROLE_ACCOUNTS.forEach((account) => {
    console.log(`  ${account.role.padEnd(14)} ${account.email}`)
  })
  console.log('  Tenant code (kiosk): DEWEBNET')
  console.log('═══════════════════════════════════\n')

  await mongoose.disconnect()
}

seed().catch(err => { console.error(err); process.exit(1) })
