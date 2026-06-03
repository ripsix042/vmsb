/**
 * Password strength validation (TRD §8: minimum complexity configurable).
 * Use when creating or resetting passwords.
 */
const { PASSWORD } = require('../config/security');

function validatePassword(password, options = {}) {
  const err = [];
  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Password is required'] };
  }
  const p = password;
  const username = options.username?.trim();

  if (p.length < PASSWORD.MIN_LENGTH) {
    err.push(`Password must be at least ${PASSWORD.MIN_LENGTH} characters`);
  }
  if (p.length > PASSWORD.MAX_LENGTH) {
    err.push(`Password must be at most ${PASSWORD.MAX_LENGTH} characters`);
  }
  if (PASSWORD.requireUppercase && !/[A-Z]/.test(p)) {
    err.push('Password must contain at least one uppercase letter');
  }
  if (PASSWORD.requireLowercase && !/[a-z]/.test(p)) {
    err.push('Password must contain at least one lowercase letter');
  }
  if (PASSWORD.requireNumber && !/\d/.test(p)) {
    err.push('Password must contain at least one number');
  }
  if (PASSWORD.requireSpecial && !/[^A-Za-z0-9]/.test(p)) {
    err.push('Password must contain at least one special character');
  }

  if (username && p.length >= 3) {
    const userLower = username.toLowerCase();
    const passLower = p.toLowerCase();
    if (passLower.includes(userLower) || userLower.includes(passLower)) {
      err.push('Password must not contain your username or email');
    }
  }

  return {
    valid: err.length === 0,
    errors: err.length ? err : undefined,
  };
}

module.exports = { validatePassword, PASSWORD };
