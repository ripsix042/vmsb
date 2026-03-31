const crypto = require('crypto');
const { USE_HTTPONLY_COOKIE, CSRF, isProduction } = require('../config/security');
const { unauthorized } = require('../utils/errors');

function csrfCookieOptions() {
  return {
    httpOnly: false,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/api/v1/auth',
  };
}

function issueCsrfToken(req, res, next) {
  if (!USE_HTTPONLY_COOKIE || !CSRF.enabled) {
    return res.json({ csrfToken: null, enabled: false });
  }
  const token = crypto.randomBytes(24).toString('hex');
  res.cookie(CSRF.cookieName, token, csrfCookieOptions());
  return res.json({ csrfToken: token, enabled: true });
}

function requireCsrf(req, res, next) {
  if (!USE_HTTPONLY_COOKIE || !CSRF.enabled) return next();
  const cookieToken = req.cookies?.[CSRF.cookieName];
  const headerToken = req.get(CSRF.headerName);
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return next(unauthorized('Invalid CSRF token'));
  }
  return next();
}

module.exports = { issueCsrfToken, requireCsrf };
