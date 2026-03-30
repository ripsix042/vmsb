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
  randomPKCECodeVerifier,
  calculatePKCECodeChallenge,
  randomNonce,
  randomState,
  buildLoginUrl,
  exchangeCodeForTokens,
  getUserInfo,
} = require('../services/oktaOidc');
const {
  OKTA_POST_LOGIN_REDIRECT,
  OKTA_AUTO_PROVISION,
  OKTA_SYNC_ROLE_FROM_INTENT,
  isDualOktaMode,
  getOktaClientCredentials,
  oktaCookieOptions,
} = require('../config/okta');
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

function departmentFieldsForUser(user) {
  const u = user.toObject ? user.toObject() : user;
  return {
    department_id: u.departmentId ? u.departmentId.toString() : null,
    department_name: u.departmentName || null,
  };
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
      ...departmentFieldsForUser(user),
    },
    role: toFrontendRole(user.role),
  };
}

async function attachRefreshToPayload(payload, user, req, res) {
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
  } else {
    payload.refreshToken = refreshToken;
  }
  return payload;
}

function setOktaTransientCookies(res, { state, nonce, codeVerifier, intent }) {
  const opts = oktaCookieOptions();
  res.cookie('okta_state', state, opts);
  res.cookie('okta_nonce', nonce, opts);
  res.cookie('okta_cv', codeVerifier, opts);
  res.cookie('okta_intent', intent, opts);
}

function clearOktaTransientCookies(res) {
  const opts = oktaCookieOptions();
  res.clearCookie('okta_state', { path: opts.path });
  res.clearCookie('okta_nonce', { path: opts.path });
  res.clearCookie('okta_cv', { path: opts.path });
  res.clearCookie('okta_intent', { path: opts.path });
}

/** OAuth/OIDC error or incomplete callback: send user back to SPA instead of JSON 400. */
/** Local role from Okta login entry point (cookie set by /auth/okta/login?intent=…). */
function roleFromOktaIntentCookie(oktaIntent) {
  if (oktaIntent === 'admin') return ROLES.ADMIN;
  if (oktaIntent === 'host') return ROLES.EMPLOYEE;
  return ROLES.EMPLOYEE;
}

function redirectOktaFailure(res, { error, errorDescription }) {
  clearOktaTransientCookies(res);
  const code = error || 'okta_callback_failed';
  const desc = errorDescription ? String(errorDescription).slice(0, 500) : '';
  if (!OKTA_POST_LOGIN_REDIRECT) {
    return res.status(400).json({
      error: code,
      message: desc || 'Okta sign-in did not complete',
    });
  }
  const url = new URL(OKTA_POST_LOGIN_REDIRECT);
  url.searchParams.set('error', code);
  if (desc) url.searchParams.set('error_description', desc);
  return res.redirect(url.toString());
}

/**
 * GET /auth/okta/login
 * Redirects user to Okta for Admin/Employee SSO (OIDC Authorization Code + PKCE).
 * Dual Okta apps: ?intent=admin | ?intent=host (or employee → host). Single app: omit intent.
 */
const oktaLogin = async (req, res, next) => {
  try {
    const raw = String(req.query.intent || '').toLowerCase();
    let intentCookie = 'legacy';
    if (isDualOktaMode()) {
      if (raw === 'admin') intentCookie = 'admin';
      else if (raw === 'host' || raw === 'employee') intentCookie = 'host';
      else {
        return res.status(400).json({
          error: 'missing_intent',
          message: 'This deployment uses separate Okta apps for admin and host. Use ?intent=admin or ?intent=host',
        });
      }
    } else if (raw === 'admin') {
      intentCookie = 'admin';
    } else if (raw === 'host' || raw === 'employee') {
      intentCookie = 'host';
    }

    const { clientId, clientSecret } = getOktaClientCredentials(intentCookie === 'legacy' ? 'legacy' : intentCookie);

    const state = randomState();
    const nonce = randomNonce();
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

    setOktaTransientCookies(res, { state, nonce, codeVerifier, intent: intentCookie });
    const url = await buildLoginUrl({ state, nonce, codeChallenge, clientId, clientSecret });
    res.redirect(url);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /auth/okta/callback
 * Exchanges code for tokens, validates state/nonce, maps Okta user to local user,
 * then issues our API access/refresh tokens and redirects back to frontend.
 */
const oktaCallback = async (req, res, next) => {
  try {
    const oidcError = req.query.error;
    const oidcErrorDesc = req.query.error_description;
    if (oidcError && typeof oidcError === 'string') {
      return redirectOktaFailure(res, {
        error: oidcError,
        errorDescription: typeof oidcErrorDesc === 'string' ? oidcErrorDesc : undefined,
      });
    }

    const { code, state } = req.query;
    const expectedState = req.cookies?.okta_state;
    const expectedNonce = req.cookies?.okta_nonce;
    const pkceCodeVerifier = req.cookies?.okta_cv;
    const oktaIntent = req.cookies?.okta_intent;

    if (!code || typeof code !== 'string') {
      return redirectOktaFailure(res, {
        error: 'missing_authorization_code',
        errorDescription:
          'No authorization code returned. Use Sign in with Okta from the app, or complete sign-in at Okta.',
      });
    }
    if (!state || typeof state !== 'string') throw badRequest('Missing state');
    if (!expectedState || !pkceCodeVerifier || !expectedNonce) {
      clearOktaTransientCookies(res);
      throw unauthorized('SSO session expired. Please try again.');
    }
    if (state !== expectedState) {
      clearOktaTransientCookies(res);
      throw unauthorized('Invalid state');
    }

    if (isDualOktaMode()) {
      if (oktaIntent !== 'admin' && oktaIntent !== 'host') {
        clearOktaTransientCookies(res);
        throw unauthorized('SSO session expired. Please try again.');
      }
    }

    const { clientId, clientSecret } = getOktaClientCredentials(
      isDualOktaMode() ? oktaIntent : 'legacy'
    );

    // openid-client v6 requires a URL object (or Request), not a string.
    const currentUrl = new URL(`${req.protocol}://${req.get('host')}${req.originalUrl}`);
    const tokens = await exchangeCodeForTokens({
      currentUrl,
      pkceCodeVerifier,
      expectedState,
      expectedNonce,
      clientId,
      clientSecret,
    });
    clearOktaTransientCookies(res);

    const claims = typeof tokens?.claims === 'function' ? tokens.claims() : {};
    const userInfo = await getUserInfo(tokens, clientId, clientSecret);

    const email =
      (claims && (claims.email || claims.preferred_username)) ||
      (userInfo && (userInfo.email || userInfo.preferred_username));
    const fullName =
      (claims && (claims.name || claims.given_name)) ||
      (userInfo && (userInfo.name || userInfo.given_name)) ||
      '';

    if (!email || typeof email !== 'string') {
      throw unauthorized('Okta did not return an email for this user');
    }
    const normalizedEmail = email.trim().toLowerCase();

    let user = await User.findOne({ email: normalizedEmail }).select('-passwordHash');
    if (!user) {
      if (!OKTA_AUTO_PROVISION) {
        throw unauthorized('Account is not provisioned. Contact an admin.');
      }
      user = await User.create({
        fullName: fullName ? String(fullName).trim() : normalizedEmail,
        email: normalizedEmail,
        // Not used for Okta users; required by schema. Use random value.
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), PASSWORD.BCRYPT_ROUNDS),
        role: roleFromOktaIntentCookie(oktaIntent),
        status: USER_STATUS.ACTIVE,
      });
    } else if (OKTA_SYNC_ROLE_FROM_INTENT && oktaIntent && oktaIntent !== 'legacy') {
      const desired = roleFromOktaIntentCookie(oktaIntent);
      if (user.role !== desired) {
        user.role = desired;
        await user.save();
      }
    }
    if (user.status !== 'Active') {
      throw unauthorized('Account is inactive');
    }

    if (isDualOktaMode() && !OKTA_SYNC_ROLE_FROM_INTENT) {
      if (oktaIntent === 'admin' && user.role !== ROLES.ADMIN) {
        throw unauthorized('This account is not an administrator. Use the host sign-in with Okta.');
      }
      if (oktaIntent === 'host' && user.role !== ROLES.EMPLOYEE) {
        throw unauthorized('This account is not a host. Use the admin sign-in with Okta.');
      }
    }

    logLoginSuccess(req, user._id, normalizedEmail);
    logAudit({
      userId: user._id,
      action: 'login_okta',
      metadata: { summary: 'Signed in with Okta', role: toFrontendRole(user.role) },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent'),
    }).catch(() => {});

    // Issue our API tokens, then redirect to frontend
    let payload = createAccessPayload(user);
    payload = await attachRefreshToPayload(payload, user, req, res);

    if (!OKTA_POST_LOGIN_REDIRECT) {
      return res.json(payload);
    }

    const redirectUrl = new URL(OKTA_POST_LOGIN_REDIRECT);
    redirectUrl.searchParams.set('token', payload.token);
    if (payload.refreshToken) redirectUrl.searchParams.set('refreshToken', payload.refreshToken);
    redirectUrl.searchParams.set('role', payload.role);
    res.redirect(redirectUrl.toString());
  } catch (err) {
    next(err);
  }
};

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
      metadata: {
        role: toFrontendRole(user.role),
        summary: `Signed in as ${toFrontendRole(user.role)}`,
      },
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
        ...departmentFieldsForUser(user),
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
        ...departmentFieldsForUser(user),
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
        ...departmentFieldsForUser(user),
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
        ...departmentFieldsForUser(user),
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
    }).select('+passwordHash');
    if (!user) throw unauthorized('Kiosk operator not found');
    user.passwordHash = await bcrypt.hash(password, PASSWORD.BCRYPT_ROUNDS);
    await user.save();

    const secret = generateSecret();
    const setupToken = setSetupSession(user._id.toString(), secret);
    const accountName = 'Kiosk Operator';
    const qrCodeUrl = buildOtpAuthUrl({ secret, accountName, issuer: 'Kora VMS' });
    logAudit({
      userId: user._id,
      action: 'kiosk_setup',
      resourceType: 'User',
      resourceId: user._id.toString(),
      metadata: { summary: `Kiosk setup started for ${user.fullName}` },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent'),
    }).catch(() => {});
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
      { twoFactorSecret: setup.secret, twoFactorEnabled: true, status: USER_STATUS.ACTIVE },
      { new: true }
    );
    if (!user) throw unauthorized('Kiosk operator not found');
    clearSetupSession(setupToken);
    logAudit({
      userId: user._id,
      action: 'kiosk_2fa_enroll',
      resourceType: 'User',
      resourceId: user._id.toString(),
      metadata: { summary: 'Kiosk 2FA enrolled' },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent'),
    }).catch(() => {});
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
      logAudit({
        userId: user._id,
        action: 'kiosk_login_challenge',
        resourceType: 'User',
        resourceId: user._id.toString(),
        metadata: { summary: 'Kiosk login awaiting 2FA' },
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('user-agent'),
      }).catch(() => {});
      return res.json({ requires2FA: true, tempToken });
    }
    logAudit({
      userId: user._id,
      action: 'kiosk_login',
      resourceType: 'User',
      resourceId: user._id.toString(),
      metadata: {
        role: toFrontendRole(user.role),
        summary: `Signed in as ${toFrontendRole(user.role)}`,
      },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent'),
    }).catch(() => {});
    const payload = createAccessPayload(user);
    await attachRefreshToPayload(payload, user, req, res);
    return res.json(payload);
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
    logAudit({
      userId: user._id,
      action: 'kiosk_2fa_verify',
      resourceType: 'User',
      resourceId: user._id.toString(),
      metadata: {
        role: toFrontendRole(user.role),
        summary: `2FA verified as ${toFrontendRole(user.role)}`,
      },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent'),
    }).catch(() => {});
    const payload = createAccessPayload(user);
    await attachRefreshToPayload(payload, user, req, res);
    return res.json(payload);
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
    } else if (req.user?._id) {
      await RefreshToken.updateMany(
        { userId: req.user._id, revokedAt: null },
        { revokedAt: new Date() }
      );
      logLogout(req, req.user._id);
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
  oktaLogin,
  oktaCallback,
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
