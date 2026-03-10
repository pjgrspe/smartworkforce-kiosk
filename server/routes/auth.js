/**
 * Auth Routes — POST /api/auth/login
 */

const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const MongoDBService = require('../services/mongodb-service');
const { signToken } = require('../middleware/auth');
const logger  = require('../utils/logger');

const db = new MongoDBService();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  // Sanitize email
  const cleanEmail = String(email).toLowerCase().trim();

  try {
    const user = await db.findUserByEmail(cleanEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(String(password), user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await db.updateLastLogin(user._id);

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
        firstName:user.firstName,
        lastName: user.lastName
      }
    });
  } catch (err) {
    logger.error('Login error:', err.message);
    return res.status(500).json({ error: 'Authentication failed' });
  }
});

module.exports = router;
