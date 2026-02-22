/**
 * Password strength validation (TRD §8: minimum complexity configurable).
 * Use when creating or resetting passwords.
 */
const { PASSWORD } = require('../config/security');

function validatePassword(password) {
  const err = [];
  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Password is required'] };
  }
  const p = password;
  if (p.length < PASSWORD.MIN_LENGTH) {
    err.push(`Password must be at least ${PASSWORD.MIN_LENGTH} characters`);
  }
  if (p.length > PASSWORD.MAX_LENGTH) {
    err.push(`Password must be at most ${PASSWORD.MAX_LENGTH} characters`);
  }
  if (PASSWORD.requireLetter && !/[a-zA-Z]/.test(p)) {
    err.push('Password must contain at least one letter');
  }
  if (PASSWORD.requireNumber && !/\d/.test(p)) {
    err.push('Password must contain at least one number');
  }
  return {
    valid: err.length === 0,
    errors: err.length ? err : undefined,
  };
}

module.exports = { validatePassword, PASSWORD };
