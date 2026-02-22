const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Access token from Authorization header only (industry practice: short-lived, client sends in header).
 * Refresh token lives in httpOnly cookie or body for /refresh.
 */
const getAccessToken = (req) => {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
};

/**
 * Verify JWT and attach req.user. Use after rate-limit; returns 401 if missing/invalid token.
 */
const authenticate = async (req, res, next) => {
  try {
    const token = getAccessToken(req);

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
    }
    if (user.status !== 'Active') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Account inactive' });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
    next(err);
  }
};

module.exports = { authenticate };
