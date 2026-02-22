const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { unauthorized } = require('../utils/errors');
const {
  JWT_ACCESS_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
  USE_HTTPONLY_COOKIE,
  COOKIE_NAME_REFRESH,
  COOKIE_OPTIONS,
} = require('../config/security');
const {
  logLoginSuccess,
  logLoginFailure,
  logLogout,
  logRefreshTokenUsed,
} = require('../services/securityLogger');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

function setRefreshCookie(res, token) {
  res.cookie(COOKIE_NAME_REFRESH, token, COOKIE_OPTIONS);
}

function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME_REFRESH, { path: COOKIE_OPTIONS.path });
}

/**
 * POST /auth/login
 * Returns: { token (access), refreshToken? (if not httpOnly), user }
 * Optionally sets refresh in httpOnly cookie when USE_HTTPONLY_COOKIE=true.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      logLoginFailure(req, 'user_not_found', email);
      throw unauthorized('Invalid email or password');
    }
    const valid = await user.comparePassword(password);
    if (!valid) {
      logLoginFailure(req, 'invalid_password', email);
      throw unauthorized('Invalid email or password');
    }
    if (user.status !== 'Active') {
      logLoginFailure(req, 'account_inactive', email);
      throw unauthorized('Account is inactive');
    }

    const accessToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRES_IN }
    );
    const refreshToken = generateRefreshToken();
    const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshToken.create({
      userId: user._id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpires,
      userAgent: req.get('user-agent') || null,
    });

    if (USE_HTTPONLY_COOKIE) {
      setRefreshCookie(res, refreshToken);
    }

    logLoginSuccess(req, user._id, user.email);

    const payload = {
      token: accessToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    };
    if (!USE_HTTPONLY_COOKIE) {
      payload.refreshToken = refreshToken;
    }
    res.json(payload);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/refresh
 * Body: { refreshToken } or cookie (when USE_HTTPONLY_COOKIE).
 * Returns: { token (new access), refreshToken? (if rotated and not cookie) }
 */
const refresh = async (req, res, next) => {
  try {
    const token =
      req.cookies?.[COOKIE_NAME_REFRESH] ||
      req.body?.refreshToken ||
      req.body?.refresh_token;
    if (!token) {
      throw unauthorized('Refresh token required');
    }
    const hash = hashToken(token);
    const doc = await RefreshToken.findOne({ tokenHash: hash });
    if (!doc || doc.revokedAt || doc.expiresAt < new Date()) {
      if (USE_HTTPONLY_COOKIE) clearRefreshCookie(res);
      throw unauthorized('Invalid or expired refresh token');
    }
    const user = await User.findById(doc.userId).select('-passwordHash');
    if (!user || user.status !== 'Active') {
      await RefreshToken.updateOne({ _id: doc._id }, { revokedAt: new Date() });
      throw unauthorized('User not found or inactive');
    }

    logRefreshTokenUsed(req, user._id);

    const accessToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRES_IN }
    );
    const newRefresh = generateRefreshToken();
    const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshToken.updateOne(
      { _id: doc._id },
      { revokedAt: new Date() }
    );
    await RefreshToken.create({
      userId: user._id,
      tokenHash: hashToken(newRefresh),
      expiresAt: refreshExpires,
      userAgent: req.get('user-agent') || null,
    });

    if (USE_HTTPONLY_COOKIE) {
      setRefreshCookie(res, newRefresh);
    }

    const payload = { token: accessToken };
    if (!USE_HTTPONLY_COOKIE) payload.refreshToken = newRefresh;
    res.json(payload);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/logout
 * Body: { refreshToken } or cookie. Revokes the refresh token.
 */
const logout = async (req, res, next) => {
  try {
    const token =
      req.cookies?.[COOKIE_NAME_REFRESH] ||
      req.body?.refreshToken ||
      req.body?.refresh_token;
    if (token) {
      const hash = hashToken(token);
      const doc = await RefreshToken.findOne({ tokenHash: hash, revokedAt: null });
      if (doc) {
        await RefreshToken.updateOne({ _id: doc._id }, { revokedAt: new Date() });
        logLogout(req, doc.userId);
      }
    }
    if (USE_HTTPONLY_COOKIE) clearRefreshCookie(res);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

module.exports = { login, refresh, logout };
