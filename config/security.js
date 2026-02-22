/**
 * Security configuration (TRD §8).
 * Central place for CORS, rate limits, password policy, and JWT/Helmet options.
 */

const isProduction = process.env.NODE_ENV === 'production';

/** CORS: in production, require explicit origins (no *). */
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const getCorsOrigin = () => {
  if (corsOrigins.length > 0) return corsOrigins;
  if (isProduction) return []; // force failure in prod if not set
  return ['http://localhost:3000', 'http://127.0.0.1:3000'];
};

/** Password policy (TRD: bcrypt cost ≥ 10; configurable complexity). */
const PASSWORD = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  BCRYPT_ROUNDS: 12,
  /** Require at least one letter and one number. */
  requireLetter: true,
  requireNumber: true,
};

/** JWT – industry practice: short-lived access, longer refresh (stored server-side for revocation). */
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN || (isProduction ? '15m' : '24h');
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/** Optional: send refresh token in httpOnly cookie (XSS-safe). Access token still in response body for API/mobile. */
const USE_HTTPONLY_COOKIE = process.env.USE_HTTPONLY_COOKIE === 'true';
const COOKIE_NAME_REFRESH = process.env.COOKIE_NAME_REFRESH || 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'strict' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/v1/auth',
};

/** Rate limits (per IP) – stricter on auth. */
const RATE_LIMITS = {
  login: { windowMs: 15 * 60 * 1000, max: isProduction ? 5 : 10 },
  refresh: { windowMs: 15 * 60 * 1000, max: 20 },
  public: { windowMs: 1 * 60 * 1000, max: 60 },
  api: { windowMs: 15 * 60 * 1000, max: 200 },
};

/** Weak/default secrets that must not be used in production. */
const WEAK_JWT_SECRETS = [
  '',
  'your-super-secret-jwt-key-change-in-production',
  'secret',
  'jwt_secret',
  'change-me',
];

const isWeakJwtSecret = (secret) => {
  if (!secret || typeof secret !== 'string') return true;
  const s = secret.trim();
  if (s.length < 32) return true;
  return WEAK_JWT_SECRETS.some((weak) => s === weak || s.toLowerCase() === weak.toLowerCase());
};

module.exports = {
  isProduction,
  getCorsOrigin,
  PASSWORD,
  JWT_EXPIRES_IN: JWT_ACCESS_EXPIRES_IN,
  JWT_ACCESS_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
  USE_HTTPONLY_COOKIE,
  COOKIE_NAME_REFRESH,
  COOKIE_OPTIONS,
  RATE_LIMITS,
  isWeakJwtSecret,
};
