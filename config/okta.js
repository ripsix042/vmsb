const { isProduction } = require('./security');

/**
 * Okta OIDC configuration (Admin/Employee SSO).
 *
 * Required:
 * - OKTA_ISSUER: https://{yourOktaDomain}/oauth2/default (or your auth server)
 * - OKTA_CLIENT_ID
 * - OKTA_CLIENT_SECRET (for confidential web apps; optional for public clients)
 * - OKTA_REDIRECT_URI: https://{apiBase}/api/v1/auth/okta/callback
 *
 * Optional:
 * - OKTA_SCOPES: default "openid profile email"
 * - OKTA_POST_LOGIN_REDIRECT: where to send user after callback (frontend URL)
 * - OKTA_AUTO_PROVISION: "true" to auto-create Employee accounts if not found (default false)
 */

const OKTA_ISSUER = process.env.OKTA_ISSUER;
const OKTA_CLIENT_ID = process.env.OKTA_CLIENT_ID;
const OKTA_CLIENT_SECRET = process.env.OKTA_CLIENT_SECRET || undefined;
const OKTA_REDIRECT_URI = process.env.OKTA_REDIRECT_URI;
const OKTA_SCOPES = process.env.OKTA_SCOPES || 'openid profile email';
const OKTA_POST_LOGIN_REDIRECT = process.env.OKTA_POST_LOGIN_REDIRECT || process.env.FRONTEND_URL || '';
const OKTA_AUTO_PROVISION = process.env.OKTA_AUTO_PROVISION === 'true';

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
  OKTA_REDIRECT_URI,
  OKTA_SCOPES,
  OKTA_POST_LOGIN_REDIRECT,
  OKTA_AUTO_PROVISION,
  oktaCookieOptions,
};

