const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const User    = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');
const logger  = require('../utils/logger');

router.use(authenticate);

// GET /api/users — list users (super_admin sees all, others see own tenant)
router.get('/', authorize('super_admin', 'client_admin', 'hr_payroll'), async (req, res) => {
  try {
    const filter = req.user.role === 'super_admin'
      ? {}
      : { tenantId: req.user.tenantId };
    const users = await User.find(filter)
      .select('-passwordHash')
      .sort('lastName')
      .populate('branchId', 'name')
      .lean();
    return res.json({ data: users });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/users — create user
router.post('/', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const { email, password, role, firstName, lastName, branchId, tenantId } = req.body;
    if (!email || !password || !role || !firstName || !lastName) {
      return res.status(400).json({ error: 'email, password, role, firstName and lastName are required' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await new User({
      email:        email.toLowerCase().trim(),
      passwordHash,
      role,
      firstName,
      lastName,
      branchId:  branchId  || null,
      tenantId:  req.user.role === 'super_admin' ? (tenantId || null) : req.user.tenantId,
      isActive:  true
    }).save();

    const { passwordHash: _, ...userData } = user.toObject();
    logger.info(`User created: ${user.email} role=${user.role}`);
    return res.status(201).json({ data: userData });
  } catch (err) {
    logger.error('POST /users:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/users/:id
router.patch('/:id', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.email; // email is immutable once set
    if (updates.password) {
      updates.passwordHash = await bcrypt.hash(updates.password, 12);
      delete updates.password;
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).select('-passwordHash').lean();
    if (!user) return res.status(404).json({ error: 'Not found' });
    return res.json({ data: user });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', authorize('super_admin', 'client_admin'), async (req, res) => {
  try {
    if (req.params.id === req.user.sub) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    await User.findByIdAndDelete(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
