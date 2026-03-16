/**
 * Auth Routes — POST /api/auth/login
 */

const express   = require('express');
const bcrypt    = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const router    = express.Router();
const { authenticate } = require('../middleware/auth');
const { signToken } = require('../middleware/auth');
const logger  = require('../utils/logger');
const { getUserRepository } = require('../repositories/user');
const { getRuntimeMode } = require('../config/runtime');

const CENTRAL_ADMIN_ROLES = ['super_admin'];

// 10 attempts per IP per 15 minutes on the login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit hit on login from IP ${req.ip}`);
    res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
  },
});

async function proxyCentralLogin(email, password) {
  const centralUrl = process.env.CENTRAL_SYNC_URL;
  if (!centralUrl) return null;

  const endpoint = `${centralUrl.replace(/\/$/, '')}/api/auth/login`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  if (!data.token || !data.user) return null;
  if (!CENTRAL_ADMIN_ROLES.includes(data.user.role)) return null;

  return { ...data, centralUrl: `${centralUrl.replace(/\/$/, '')}/api` };
}

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  // Sanitize email
  const cleanEmail = String(email).toLowerCase().trim();

  try {
    // On branch machines: proxy super_admin/client_admin logins to HQ so they
    // always authenticate against the central database and get redirected there.
    if (getRuntimeMode() === 'BRANCH' && process.env.CENTRAL_SYNC_URL) {
      try {
        const centralResult = await proxyCentralLogin(cleanEmail, String(password));
        if (centralResult) {
          logger.info(`Central admin login proxied to HQ: ${cleanEmail}`);
          return res.json(centralResult);
        }
      } catch (err) {
        logger.warn(`Central login proxy failed, falling back to local auth: ${err.message}`);
      }
    }

    const userRepo = getUserRepository();
    const user = await userRepo.findByEmail(cleanEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(String(password), user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await userRepo.touchLastLogin(user._id || user.id);

    const token = signToken(user);

    logger.info(`User logged in: ${user.email} (${user.role})`);

    return res.json({
      token,
      user: {
        id:       user._id || user.id,
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
    const userRepo = getUserRepository();
    const passwordHash = await userRepo.findPasswordById(req.user.sub);
    if (!passwordHash) {
      return res.status(404).json({ error: 'User not found' });
    }

    const ok = await bcrypt.compare(String(password), passwordHash);
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
