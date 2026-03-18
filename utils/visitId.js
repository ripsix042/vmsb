const crypto = require('crypto');

const VISIT_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateVisitId() {
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += VISIT_ID_CHARS.charAt(Math.floor(Math.random() * VISIT_ID_CHARS.length));
  }
  return result;
}

function generateQrToken() {
  return 'qr-' + crypto.randomBytes(16).toString('hex');
}

module.exports = { generateVisitId, generateQrToken };
