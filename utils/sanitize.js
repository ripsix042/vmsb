/**
 * NoSQL injection guard: strip keys that could be used in MongoDB operators.
 * Use on any object built from user input before passing to Mongoose/Mongo.
 * Industry practice: never allow $ or . in user-supplied field names.
 */
function sanitizeForMongo(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForMongo);

  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('$') || key.includes('.')) continue;
    out[key] = sanitizeForMongo(value);
  }
  return out;
}

/**
 * Sanitize a string used in regex (e.g. search). Escapes regex special chars.
 */
function escapeRegex(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { sanitizeForMongo, escapeRegex };
