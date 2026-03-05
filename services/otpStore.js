/**
 * In-memory OTP store for kiosk phone verification.
 * Key: phone (string). Value: { code, expiresAt }.
 * For production with multiple instances, replace with Redis or DB.
 */
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CODE_LENGTH = 6;

const store = new Map();

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

function set(phone, code, ttlMs = OTP_TTL_MS) {
  const key = String(phone).trim();
  store.set(key, {
    code,
    expiresAt: Date.now() + ttlMs,
  });
}

function get(phone) {
  const key = String(phone).trim();
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.code;
}

function remove(phone) {
  store.delete(String(phone).trim());
}

module.exports = {
  OTP_TTL_MS,
  CODE_LENGTH,
  generateCode,
  set,
  get,
  remove,
};
