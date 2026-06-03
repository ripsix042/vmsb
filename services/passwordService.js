const bcrypt = require('bcryptjs');
const { PASSWORD } = require('../config/security');
const { validatePassword } = require('../utils/passwordPolicy');
const { badRequest } = require('../utils/errors');

function validatePasswordOrThrow(plain, options = {}) {
  const result = validatePassword(plain, options);
  if (!result.valid) {
    throw badRequest(result.errors.join('; '), { password: result.errors });
  }
}

async function assertPasswordNotInHistory(plain, currentHash, historyEntries = []) {
  const hashes = [];
  if (currentHash) hashes.push(currentHash);
  for (const entry of historyEntries) {
    const hash = typeof entry === 'string' ? entry : entry?.hash;
    if (hash) hashes.push(hash);
  }
  for (const hash of hashes) {
    const match = await bcrypt.compare(plain, hash);
    if (match) {
      throw badRequest('Cannot reuse a recent password');
    }
  }
}

function trimHistory(history = [], maxCount = PASSWORD.HISTORY_COUNT) {
  return history.slice(-maxCount);
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, PASSWORD.BCRYPT_ROUNDS);
}

/**
 * Validate, check history, update passwordHash and passwordHistory on a user document.
 * Caller must save the user.
 */
async function applyPasswordChange(userDoc, newPlain, options = {}) {
  validatePasswordOrThrow(newPlain, options);
  const currentHash = userDoc.passwordHash || null;
  const history = userDoc.passwordHistory || [];
  await assertPasswordNotInHistory(newPlain, currentHash, history);

  if (currentHash) {
    history.push({ hash: currentHash, changedAt: new Date() });
    userDoc.passwordHistory = trimHistory(history);
  }

  userDoc.passwordHash = await hashPassword(newPlain);
  return userDoc;
}

/**
 * For new users (User.create): validate only, no history check.
 */
async function prepareNewUserPassword(plain, options = {}) {
  validatePasswordOrThrow(plain, options);
  return hashPassword(plain);
}

module.exports = {
  validatePasswordOrThrow,
  assertPasswordNotInHistory,
  applyPasswordChange,
  prepareNewUserPassword,
  hashPassword,
};
