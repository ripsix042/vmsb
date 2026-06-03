const crypto = require('crypto');

const EXCHANGE_TTL_MS = 2 * 60 * 1000; // 2 minutes

const exchanges = new Map();

function createExchangeCode(payload, ttlMs = EXCHANGE_TTL_MS) {
  const code = crypto.randomBytes(32).toString('hex');
  exchanges.set(code, {
    payload,
    expiresAt: Date.now() + ttlMs,
  });
  return code;
}

function consumeExchangeCode(code) {
  const key = String(code || '').trim();
  if (!key) return null;
  const entry = exchanges.get(key);
  if (!entry) return null;
  exchanges.delete(key);
  if (Date.now() > entry.expiresAt) return null;
  return entry.payload;
}

module.exports = { createExchangeCode, consumeExchangeCode, EXCHANGE_TTL_MS };
