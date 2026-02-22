/**
 * Security event logging (industry practice). Never log passwords or tokens.
 * Use for audit trail and incident response.
 */
function getClientMeta(req) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const userAgent = req.get('user-agent') || '';
  return { ip, userAgent };
}

function logSecurityEvent(event, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ...meta,
  };
  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify(entry));
  } else {
    console.warn('[Security]', entry);
  }
}

function logLoginSuccess(req, userId, email) {
  logSecurityEvent('login_success', {
    userId: userId?.toString(),
    email: email ? `${email.substring(0, 3)}***` : undefined,
    ...getClientMeta(req),
  });
}

function logLoginFailure(req, reason = 'invalid_credentials', email = null) {
  logSecurityEvent('login_failure', {
    reason,
    email: email ? `${email.substring(0, 3)}***` : undefined,
    ...getClientMeta(req),
  });
}

function logLogout(req, userId) {
  logSecurityEvent('logout', {
    userId: userId?.toString(),
    ...getClientMeta(req),
  });
}

function logRefreshTokenUsed(req, userId) {
  logSecurityEvent('refresh_used', {
    userId: userId?.toString(),
    ...getClientMeta(req),
  });
}

module.exports = {
  logSecurityEvent,
  logLoginSuccess,
  logLoginFailure,
  logLogout,
  logRefreshTokenUsed,
  getClientMeta,
};
