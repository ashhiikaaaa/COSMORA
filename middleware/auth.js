// ═══════════════════════════════════════════════════════════
//  JWT Auth Middleware
// ═══════════════════════════════════════════════════════════
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'cosmora_fallback_secret';

/**
 * Middleware: Protect routes — attaches req.user if valid JWT found.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please sign in.',
      code: 'NO_TOKEN'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Session expired. Please sign in again.',
        code: 'TOKEN_EXPIRED'
      });
    }
    return res.status(403).json({
      success: false,
      error: 'Invalid authentication token.',
      code: 'INVALID_TOKEN'
    });
  }
}

/**
 * Middleware: Optional auth — doesn't block unauthenticated requests.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    } catch (e) {
      // silently ignore invalid tokens for optional auth
    }
  }
  next();
}

/**
 * Generate JWT for a user.
 */
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, first_name: user.first_name },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = { authenticate, optionalAuth, generateToken };
