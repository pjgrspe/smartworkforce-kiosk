/**
 * JWT Authentication Middleware
 */

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production';

/**
 * Sign a JWT for a user document.
 */
function signToken(user) {
  return jwt.sign(
    {
      sub:      user._id.toString(),
      email:    user.email,
      role:     user.role,
      tenantId: user.tenantId ? user.tenantId.toString() : null,
      branchId: user.branchId ? user.branchId.toString() : null
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );
}

/**
 * Express middleware — attach decoded payload to req.user.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Hydrate tenantId from DB when the token was signed before tenantId was set
    if (!payload.tenantId) {
      const user = await User.findById(payload.sub).select('tenantId branchId role').lean();
      if (user && user.tenantId) {
        payload.tenantId = user.tenantId.toString();
        payload.branchId = user.branchId ? user.branchId.toString() : payload.branchId;
      }
    }
    req.user = payload;
    next();
  } catch (err) {
    logger.warn('JWT verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Role-based guard factory.
 * @param {...string} allowedRoles
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { signToken, authenticate, authorize };
