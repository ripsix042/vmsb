function maskEmail(email) {
  const value = String(email || '').trim();
  if (!value.includes('@')) return value ? '***' : '';
  const [local, domain] = value.split('@');
  const localMasked = local.length <= 2 ? `${local[0] || '*'}***` : `${local.slice(0, 2)}***`;
  return `${localMasked}@${domain}`;
}

function maskPhone(phone) {
  const value = String(phone || '').replace(/\s+/g, '');
  if (!value) return '';
  if (value.length <= 4) return '***';
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function maskValueByKey(key, value) {
  const k = String(key || '').toLowerCase();
  if (k.includes('email')) return maskEmail(value);
  if (k.includes('phone') || k.includes('mobile')) return maskPhone(value);
  if (k.includes('token') || k.includes('secret') || k.includes('password') || k.includes('api_key') || k.includes('apikey')) {
    return '[REDACTED]';
  }
  return value;
}

function maskPiiDeep(input) {
  if (Array.isArray(input)) return input.map(maskPiiDeep);
  if (input && typeof input === 'object') {
    const out = {};
    Object.keys(input).forEach((key) => {
      const raw = input[key];
      const masked = maskValueByKey(key, raw);
      out[key] = masked !== raw ? masked : maskPiiDeep(raw);
    });
    return out;
  }
  return input;
}

module.exports = {
  maskPiiDeep,
  maskEmail,
  maskPhone,
};
