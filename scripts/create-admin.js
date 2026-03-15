/**
 * scripts/create-admin.js
 *
 * Creates the initial Super Admin user in MongoDB.
 * Run once after first setting up the database:
 *
 *   node scripts/create-admin.js
 *
 * Reads credentials from env vars or falls back to defaults.
 * Set ADMIN_EMAIL / ADMIN_PASSWORD before running in production.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const User     = require('../server/models/User');

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dewebnet';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB:', uri);

  const email    = process.env.ADMIN_EMAIL    || 'admin@dewebnet.local';
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`User ${email} already exists (role: ${existing.role}). Skipping.`);
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await new User({
    email,
    passwordHash,
    firstName: 'System',
    lastName:  'Admin',
    role:      'super_admin',
    tenantId:  null,
    branchId:  null,
    isActive:  true
  }).save();

  console.log(`✅ Super admin created:`);
  console.log(`   Email   : ${user.email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Role    : ${user.role}`);
  console.log('\n⚠️  Change the password immediately after first login!');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Failed to create admin:', err.message);
  process.exit(1);
});
