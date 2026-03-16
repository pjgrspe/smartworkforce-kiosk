/**
 * JWT Authentication Middleware
 */

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { getUserRepository } = require('../repositories/user');

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production';

/**
 * Sign a JWT for a user document.
 */
function signToken(user) {
  const userId = user._id ? user._id.toString() : String(user.id);
  return jwt.sign(
    {
      sub:      userId,
      email:    user.email,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      role:     user.role,
      tenantId: user.tenantId ? user.tenantId.toString() : null,
      branchId: user.branchId ? user.branchId.toString() : null,
      employeeId: user.employeeId ? user.employeeId.toString() : null
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
    if (!payload.tenantId || payload.employeeId === undefined || !payload.firstName) {
      const userRepo = getUserRepository();
      const user = await userRepo.findById(payload.sub);
      if (user) {
        payload.tenantId = user.tenantId ? user.tenantId.toString() : payload.tenantId;
        payload.branchId = user.branchId ? user.branchId.toString() : payload.branchId;
        payload.employeeId = user.employeeId ? user.employeeId.toString() : null;
        payload.firstName = user.firstName || payload.firstName || null;
        payload.lastName = user.lastName || payload.lastName || null;
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
