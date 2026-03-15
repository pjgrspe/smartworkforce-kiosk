/**
 * Auth Routes — POST /api/auth/login
 */

const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const User    = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { signToken } = require('../middleware/auth');
const logger  = require('../utils/logger');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  // Sanitize email
  const cleanEmail = String(email).toLowerCase().trim();

  try {
    const user = await User.findOne({ email: cleanEmail }).lean();
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(String(password), user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    const token = signToken(user);

    logger.info(`User logged in: ${user.email} (${user.role})`);

    return res.json({
      token,
      user: {
        id:       user._id,
        email:    user.email,
        role:     user.role,
        tenantId: user.tenantId,
        branchId: user.branchId,
        employeeId: user.employeeId,
        firstName:user.firstName,
        lastName: user.lastName,
        profilePictureUrl: user.profilePictureUrl || null
      }
    });
  } catch (err) {
    logger.error('Login error:', err.message);
    return res.status(500).json({ error: 'Authentication failed' });
  }
});

// POST /api/auth/verify-password
router.post('/verify-password', authenticate, async (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'password is required' });
  }

  try {
    const user = await User.findById(req.user.sub).select('passwordHash').lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    return res.json({ success: true, verifiedAt: new Date().toISOString() });
  } catch (err) {
    logger.error('Verify-password error:', err.message);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
