const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const VISIT_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VISIT_ID_LEN = 10;
const QR_SIGN_ALG = 'HS256';
const QR_ISSUER = 'kora-vms';
const QR_AUDIENCE = 'visitor-check-in';
const QR_SCOPE = 'visit_qr_checkin';
const QR_EXPIRES_MIN = Math.max(5, Number(process.env.QR_TOKEN_EXPIRES_MINUTES || 480));

function getQrSigningSecret() {
  const secret = process.env.QR_SIGNING_SECRET;
  if (!secret || !String(secret).trim()) {
    throw new Error('QR_SIGNING_SECRET is required for QR signing');
  }
  return String(secret).trim();
}

function generateVisitId() {
  const bytes = crypto.randomBytes(VISIT_ID_LEN);
  let result = '';
  for (let i = 0; i < VISIT_ID_LEN; i++) {
    result += VISIT_ID_CHARS.charAt(bytes[i] % VISIT_ID_CHARS.length);
  }
  return result;
}

function normalizeScheduledStart(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function issueQrToken({ visitMongoId, visitId, hostId, scheduledStart }) {
  if (!visitMongoId) throw new Error('visitMongoId is required');
  if (!visitId) throw new Error('visitId is required');
  if (!hostId) throw new Error('hostId is required');

  const secret = getQrSigningSecret();
  const jti = crypto.randomBytes(12).toString('hex');
  const scheduledStartIso = normalizeScheduledStart(scheduledStart);
  const token = jwt.sign(
    {
      vid: String(visitMongoId),
      visit_id: String(visitId),
      hostId: String(hostId),
      scheduledStart: scheduledStartIso,
      scope: QR_SCOPE,
    },
    secret,
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

function issueQrTokenForVisit(visit) {
  const visitObj = visit.toObject ? visit.toObject() : visit;
  return issueQrToken({
    visitMongoId: visitObj._id.toString(),
    visitId: visitObj.visit_id,
    hostId: visitObj.hostId.toString(),
    scheduledStart: visitObj.scheduledStart,
  });
}

function applyQrTokenToVisit(visit, qrIssued) {
  visit.qr_token = qrIssued.token;
  visit.qr_jti = qrIssued.jti;
  visit.qr_expires_at = qrIssued.expiresAt;
}

function verifyQrToken(token) {
  const decoded = jwt.verify(token, getQrSigningSecret(), {
    issuer: QR_ISSUER,
    audience: QR_AUDIENCE,
    algorithms: [QR_SIGN_ALG],
  });
  if (decoded.scope !== QR_SCOPE) {
    throw new Error('Invalid QR token scope');
  }
  return {
    visitMongoId: decoded.vid,
    visitId: decoded.visit_id,
    hostId: decoded.hostId,
    scheduledStart: decoded.scheduledStart ?? null,
    jti: decoded.jti,
    scope: decoded.scope,
  };
}

function assertQrClaimsMatchVisit(decoded, visit) {
  if (!decoded || !visit) return false;
  const visitObj = visit.toObject ? visit.toObject() : visit;
  if (visitObj.qr_jti !== decoded.jti) return false;
  if (visitObj.hostId.toString() !== String(decoded.hostId)) return false;
  if (visitObj.visit_id !== decoded.visitId) return false;
  const dbScheduled = normalizeScheduledStart(visitObj.scheduledStart);
  const tokenScheduled = normalizeScheduledStart(decoded.scheduledStart);
  if (dbScheduled !== tokenScheduled) return false;
  return true;
}

module.exports = {
  generateVisitId,
  getQrSigningSecret,
  issueQrToken,
  issueQrTokenForVisit,
  applyQrTokenToVisit,
  verifyQrToken,
  assertQrClaimsMatchVisit,
};
