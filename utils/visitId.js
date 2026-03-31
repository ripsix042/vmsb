const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const VISIT_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VISIT_ID_LEN = 10;
const QR_SIGN_ALG = 'HS256';
const QR_ISSUER = 'kora-vms';
const QR_AUDIENCE = 'visitor-check-in';
const QR_EXPIRES_MIN = Math.max(5, Number(process.env.QR_TOKEN_EXPIRES_MINUTES || 480));

function generateVisitId() {
  const bytes = crypto.randomBytes(VISIT_ID_LEN);
  let result = '';
  for (let i = 0; i < VISIT_ID_LEN; i++) {
    result += VISIT_ID_CHARS.charAt(bytes[i] % VISIT_ID_CHARS.length);
  }
  return result;
}

function issueQrToken({ visitId }) {
  if (!visitId) throw new Error('visitId is required');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required for QR signing');
  const jti = crypto.randomBytes(12).toString('hex');
  const token = jwt.sign(
    { vid: String(visitId), scope: 'visit_qr_checkin' },
    process.env.JWT_SECRET,
    {
      expiresIn: `${QR_EXPIRES_MIN}m`,
      issuer: QR_ISSUER,
      audience: QR_AUDIENCE,
      jwtid: jti,
      algorithm: QR_SIGN_ALG,
    }
  );
  return {
    token,
    jti,
    expiresAt: new Date(Date.now() + QR_EXPIRES_MIN * 60 * 1000),
  };
}

function verifyQrToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, {
    issuer: QR_ISSUER,
    audience: QR_AUDIENCE,
    algorithms: [QR_SIGN_ALG],
  });
  return {
    visitId: decoded.vid,
    jti: decoded.jti,
    scope: decoded.scope,
  };
}

module.exports = {
  generateVisitId,
  issueQrToken,
  verifyQrToken,
};
