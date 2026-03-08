const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { unauthorized, conflict, badRequest } = require('../utils/errors');
const { toFrontendRole } = require('../utils/roleMap');
const { ROLES, USER_STATUS } = require('../config/constants');
const {
  JWT_ACCESS_EXPIRES_IN,
  USE_HTTPONLY_COOKIE,
  COOKIE_NAME_REFRESH,
  COOKIE_OPTIONS,
  PASSWORD,
} = require('../config/security');
const {
  logLoginSuccess,
  logLoginFailure,
  logLogout,
  logRefreshTokenUsed,
} = require('../services/securityLogger');
const { logAudit } = require('../services/auditLog');
const { generateSecret, verifyCode, buildOtpAuthUrl } = require('../services/totp');
const {
  setSetupSession,
  getSetupSession,
  clearSetupSession,
  setTempSession,
  consumeTempSession,
} = require('../services/kiosk2faStore');

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

function createAccessPayload(user) {
  const accessToken = jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRES_IN }
  );
  return {
    token: accessToken,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    },
    role: toFrontendRole(user.role),
  };
}

/**
 * POST /auth/login
 * Returns: { token (access), refreshToken? (if not httpOnly), user }
 * Optionally sets refresh in httpOnly cookie when USE_HTTPONLY_COOKIE=true.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const identifier = (email && typeof email === 'string' ? email.trim() : '') || '';
    const query = identifier.includes('@')
      ? { email: identifier.toLowerCase() }
      : { email: identifier };
    const user = await User.findOne(query).select('+passwordHash');
    if (!user) {
      logLoginFailure(req, 'user_not_found', identifier);
      throw unauthorized('Invalid email or password');
    }
    const valid = await user.comparePassword(password);
    if (!valid) {
      logLoginFailure(req, 'invalid_password', identifier);
      throw unauthorized('Invalid email or password');
    }
    if (user.status !== 'Active') {
      logLoginFailure(req, 'account_inactive', identifier);
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

    logLoginSuccess(req, user._id, identifier);
    logAudit({
      userId: user._id,
      action: 'login',
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent'),
    }).catch(() => {});

    const payload = {
      token: accessToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
      role: toFrontendRole(user.role),
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
 * GET /auth/me
 * Return current session from token. Requires authenticate middleware.
 */
const me = async (req, res, next) => {
  try {
    const user = req.user;
    res.json({
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
      },
      role: toFrontendRole(user.role),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/register
 * Register a new host (employee). Body: { email, fullName, password }.
 */
const register = async (req, res, next) => {
  try {
    const { email, fullName, password } = req.body;
    const existing = await User.findOne({ email }).select('_id');
    if (existing) {
      throw conflict('An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(password, PASSWORD.BCRYPT_ROUNDS);
    const user = await User.create({
      fullName,
      email,
      passwordHash,
      role: ROLES.EMPLOYEE,
      status: USER_STATUS.ACTIVE,
    });
    const accessToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRES_IN }
    );
    res.status(201).json({
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
      role: 'employee',
      token: accessToken,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/kiosk/register
 * Register a kiosk operator. Body: { email, fullName, password }.
 * email is the kiosk operator's phone (stored in User.email for login).
 */
const kioskRegister = async (req, res, next) => {
  try {
    const { email, fullName, password } = req.body;
    const identifier = (email && typeof email === 'string' ? email.trim() : '') || '';
    if (!identifier) throw badRequest('Phone or identifier is required');
    const existing = await User.findOne({ email: identifier }).select('_id');
    if (existing) {
      throw conflict('A kiosk operator with this phone or identifier already exists');
    }
    const passwordHash = await bcrypt.hash(password, PASSWORD.BCRYPT_ROUNDS);
    const user = await User.create({
      fullName,
      email: identifier,
      passwordHash,
      role: ROLES.KIOSK_OPERATOR,
      status: USER_STATUS.ACTIVE,
    });
    const accessToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRES_IN }
    );
    res.status(201).json({
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
      role: 'kiosk_operator',
      token: accessToken,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /auth/kiosk/operators
 * List active kiosk operators for dropdown.
 */
const listKioskOperators = async (req, res, next) => {
  try {
    const setupCompleteOnly = String(req.query.setup_complete || '').toLowerCase() === 'true';
    const users = await User.find({
      role: ROLES.KIOSK_OPERATOR,
      status: USER_STATUS.ACTIVE,
    })
      .select('fullName twoFactorEnabled')
      .lean();
    const operators = users.map((u) => ({
      id: u._id.toString(),
      fullName: u.fullName,
      has_setup_complete: !!u.twoFactorEnabled,
    }));
    res.json({
      operators: setupCompleteOnly
        ? operators.filter((o) => o.has_setup_complete)
        : operators,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/kiosk/setup
 * Body: { operatorId, password }.
 * Sets password and returns TOTP enrollment data.
 */
const kioskSetup = async (req, res, next) => {
  try {
    const { operatorId, password } = req.body;
    const user = await User.findOne({
      _id: operatorId,
      role: ROLES.KIOSK_OPERATOR,
      status: USER_STATUS.ACTIVE,
    }).select('+passwordHash');
    if (!user) throw unauthorized('Kiosk operator not found');
    user.passwordHash = await bcrypt.hash(password, PASSWORD.BCRYPT_ROUNDS);
    await user.save();

    const secret = generateSecret();
    const setupToken = setSetupSession(user._id.toString(), secret);
    const accountName = user.email || `operator-${user._id.toString()}`;
    const qrCodeUrl = buildOtpAuthUrl({ secret, accountName });
    res.json({ setupToken, secret, qrCodeUrl });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/kiosk/2fa/enroll
 * Body: { setupToken, code }.
 */
const kioskEnroll2FA = async (req, res, next) => {
  try {
    const { setupToken, code } = req.body;
    const setup = getSetupSession(setupToken);
    if (!setup) throw unauthorized('Setup token is invalid or expired');
    if (!verifyCode(setup.secret, code)) throw badRequest('Invalid 2FA code');

    const user = await User.findByIdAndUpdate(
      setup.userId,
      { twoFactorSecret: setup.secret, twoFactorEnabled: true },
      { new: true }
    );
    if (!user) throw unauthorized('Kiosk operator not found');
    clearSetupSession(setupToken);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/kiosk/login
 * Body: { operatorId, password }.
 */
const kioskLogin = async (req, res, next) => {
  try {
    const { operatorId, password } = req.body;
    const user = await User.findOne({
      _id: operatorId,
      role: ROLES.KIOSK_OPERATOR,
    }).select('+passwordHash +twoFactorSecret');
    if (!user) throw unauthorized('Invalid operator or password');
    if (user.status !== USER_STATUS.ACTIVE) throw unauthorized('Account is inactive');
    const valid = await user.comparePassword(password);
    if (!valid) throw unauthorized('Invalid operator or password');

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const tempToken = setTempSession(user._id.toString());
      return res.json({ requires2FA: true, tempToken });
    }

    return res.json(createAccessPayload(user));
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/2fa/verify
 * Body: { tempToken, code }.
 */
const verify2FA = async (req, res, next) => {
  try {
    const { tempToken, code } = req.body;
    const temp = consumeTempSession(tempToken);
    if (!temp) throw unauthorized('2FA session expired');
    const user = await User.findById(temp.userId).select('+twoFactorSecret');
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw unauthorized('2FA not enabled for this user');
    }
    if (!verifyCode(user.twoFactorSecret, code)) {
      throw unauthorized('Invalid 2FA code');
    }
    return res.json(createAccessPayload(user));
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

const { generateCode, set: setOtp, get: getOtp, remove: removeOtp } = require('../services/otpStore');

/**
 * POST /auth/otp/send
 * Body: { phone }. Generate OTP, store it, send (e.g. SMS). Stub: log code in dev.
 */
const otpSend = async (req, res, next) => {
  try {
    const { phone } = req.body;
    const normalized = String(phone).trim();
    const code = generateCode();
    setOtp(normalized, code);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[OTP] ${normalized} => ${code}`);
    }
    res.json({ success: true, sent: true });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/otp/verify
 * Body: { phone, code }. Verify and invalidate OTP.
 */
const otpVerify = async (req, res, next) => {
  try {
    const { phone, code } = req.body;
    const normalized = String(phone).trim();
    const stored = getOtp(normalized);
    if (!stored || stored !== String(code).trim()) {
      throw unauthorized('Invalid or expired code');
    }
    removeOtp(normalized);
    res.json({ success: true, verified: true });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  login,
  refresh,
  logout,
  me,
  register,
  kioskRegister,
  otpSend,
  otpVerify,
  listKioskOperators,
  kioskSetup,
  kioskEnroll2FA,
  kioskLogin,
  verify2FA,
};
