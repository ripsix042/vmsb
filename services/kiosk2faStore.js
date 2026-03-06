const crypto = require('crypto');

const SETUP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TEMP_TTL_MS = 5 * 60 * 1000; // 5 minutes

const setupSessions = new Map();
const tempSessions = new Map();

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function setSetupSession(userId, secret, ttlMs = SETUP_TTL_MS) {
  const setupToken = createToken();
  setupSessions.set(setupToken, {
    userId: String(userId),
    secret,
    expiresAt: Date.now() + ttlMs,
  });
  return setupToken;
}

function getSetupSession(setupToken) {
  const s = setupSessions.get(String(setupToken));
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    setupSessions.delete(String(setupToken));
    return null;
  }
  return s;
}

function clearSetupSession(setupToken) {
  setupSessions.delete(String(setupToken));
}

function setTempSession(userId, ttlMs = TEMP_TTL_MS) {
  const tempToken = createToken();
  tempSessions.set(tempToken, {
    userId: String(userId),
    expiresAt: Date.now() + ttlMs,
  });
  return tempToken;
}

function consumeTempSession(tempToken) {
  const s = tempSessions.get(String(tempToken));
  if (!s) return null;
  tempSessions.delete(String(tempToken));
  if (Date.now() > s.expiresAt) return null;
  return s;
}

module.exports = {
  setSetupSession,
  getSetupSession,
  clearSetupSession,
  setTempSession,
  consumeTempSession,
};
