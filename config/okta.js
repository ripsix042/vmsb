const { isProduction } = require('./security');

/**
 * Okta OIDC configuration (Admin/Employee SSO).
 *
 * Single app (legacy):
 * - OKTA_ISSUER, OKTA_CLIENT_ID, OKTA_REDIRECT_URI
 * - OKTA_CLIENT_SECRET (confidential apps; optional for public clients)
 *
 * Two apps (admin vs host / employee) — set both client IDs; login uses ?intent=admin|host:
 * - OKTA_ADMIN_CLIENT_ID, OKTA_ADMIN_CLIENT_SECRET
 * - OKTA_HOST_CLIENT_ID, OKTA_HOST_CLIENT_SECRET
 * Same OKTA_REDIRECT_URI must be registered on both Okta applications.
 *
 * Optional:
 * - OKTA_SCOPES: default "openid profile email"
 * - OKTA_POST_LOGIN_REDIRECT: where to send user after callback (frontend URL)
 * - OKTA_AUTO_PROVISION: "true" to auto-create Employee accounts if not found (default false)
 */

/**
 * Okta org issuer is e.g. https://login.example.com — discovery at /.well-known/openid-configuration
 * Common mistake: setting OKTA_ISSUER to .../oauth2/v1 (that is endpoint prefix, not issuer).
 */
function normalizeOktaIssuer(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  let s = raw.trim().replace(/\/$/, '');
  if (/\/oauth2\/v1$/i.test(s)) {
    return s.replace(/\/oauth2\/v1$/i, '');
  }
  return s;
}

const OKTA_ISSUER_RAW = process.env.OKTA_ISSUER;
const OKTA_ISSUER = normalizeOktaIssuer(OKTA_ISSUER_RAW);
if (OKTA_ISSUER_RAW && /\/oauth2\/v1\/?$/i.test(String(OKTA_ISSUER_RAW).trim())) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Okta] OKTA_ISSUER was .../oauth2/v1 — that is an API path, not the OIDC issuer. Use the "issuer" field from /.well-known/openid-configuration (e.g. https://login.example.com). Normalized.'
  );
}
const OKTA_CLIENT_ID = process.env.OKTA_CLIENT_ID;
const OKTA_CLIENT_SECRET = process.env.OKTA_CLIENT_SECRET || undefined;
const OKTA_ADMIN_CLIENT_ID = process.env.OKTA_ADMIN_CLIENT_ID;
const OKTA_ADMIN_CLIENT_SECRET = process.env.OKTA_ADMIN_CLIENT_SECRET || undefined;
const OKTA_HOST_CLIENT_ID = process.env.OKTA_HOST_CLIENT_ID;
const OKTA_HOST_CLIENT_SECRET = process.env.OKTA_HOST_CLIENT_SECRET || undefined;
const OKTA_REDIRECT_URI = process.env.OKTA_REDIRECT_URI;
const OKTA_SCOPES = process.env.OKTA_SCOPES || 'openid profile email';
const OKTA_POST_LOGIN_REDIRECT = process.env.OKTA_POST_LOGIN_REDIRECT || process.env.FRONTEND_URL || '';
const OKTA_AUTO_PROVISION = process.env.OKTA_AUTO_PROVISION === 'true';
/** Set `true` only if your IdP issuer intentionally has no `/oauth2/` segment (non-standard). */
const OKTA_RELAX_ISSUER_CHECK = process.env.OKTA_RELAX_ISSUER_CHECK === 'true';

/** When both admin + host client IDs are set, each flow uses its own Okta app. */
function isDualOktaMode() {
  return !!(OKTA_ADMIN_CLIENT_ID && OKTA_HOST_CLIENT_ID);
}

/**
 * @param {'admin' | 'host' | 'legacy'} intent
 * @returns {{ clientId: string, clientSecret: string | undefined }}
 */
function getOktaClientCredentials(intent) {
  if (isDualOktaMode()) {
    if (intent === 'admin') {
      return { clientId: OKTA_ADMIN_CLIENT_ID, clientSecret: OKTA_ADMIN_CLIENT_SECRET };
    }
    if (intent === 'host') {
      return { clientId: OKTA_HOST_CLIENT_ID, clientSecret: OKTA_HOST_CLIENT_SECRET };
    }
    const err = new Error('Okta dual-app mode: use ?intent=admin or ?intent=host');
    err.statusCode = 400;
    throw err;
  }
  return { clientId: OKTA_CLIENT_ID, clientSecret: OKTA_CLIENT_SECRET };
}

function assertOktaEnvPresent() {
  const missing = [];
  if (!OKTA_ISSUER) missing.push('OKTA_ISSUER');
  if (!OKTA_REDIRECT_URI) missing.push('OKTA_REDIRECT_URI');
  if (isDualOktaMode()) {
    if (!OKTA_ADMIN_CLIENT_ID) missing.push('OKTA_ADMIN_CLIENT_ID');
    if (!OKTA_HOST_CLIENT_ID) missing.push('OKTA_HOST_CLIENT_ID');
  } else if (!OKTA_CLIENT_ID) {
    missing.push('OKTA_CLIENT_ID');
  }
  if (missing.length) {
    const err = new Error(`Okta is not configured. Missing: ${missing.join(', ')}`);
    err.statusCode = 500;
    throw err;
  }
  if (!OKTA_RELAX_ISSUER_CHECK && OKTA_ISSUER && !String(OKTA_ISSUER).includes('/oauth2/')) {
    const err = new Error(
      'OKTA_ISSUER must be the OAuth authorization server Issuer URI (e.g. https://login.example.com/oauth2/default), not the account login URL root. In Okta: Security → API → default → copy Issuer URI.'
    );
    err.statusCode = 500;
    throw err;
  }
}

function oktaCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000, // 10 minutes
    path: '/api/v1/auth/okta',
  };
}

module.exports = {
  OKTA_ISSUER,
  OKTA_CLIENT_ID,
  OKTA_CLIENT_SECRET,
  OKTA_ADMIN_CLIENT_ID,
  OKTA_ADMIN_CLIENT_SECRET,
  OKTA_HOST_CLIENT_ID,
  OKTA_HOST_CLIENT_SECRET,
  OKTA_REDIRECT_URI,
  OKTA_SCOPES,
  OKTA_POST_LOGIN_REDIRECT,
  OKTA_AUTO_PROVISION,
  OKTA_RELAX_ISSUER_CHECK,
  isDualOktaMode,
  getOktaClientCredentials,
  assertOktaEnvPresent,
  oktaCookieOptions,
};

