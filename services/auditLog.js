const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');
const { emitGlobal } = require('./socket');

function computeAuditEntryHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Write an audit log entry. Call from controllers after sensitive actions.
 * @param {Object} options
 * @param {string} options.userId - ID of user who performed the action
 * @param {string} options.action - Action name (e.g. 'login', 'staff.create', 'visit.check_in')
 * @param {string} [options.resourceType] - e.g. 'User', 'Visit'
 * @param {string} [options.resourceId] - ID of affected resource
 * @param {*} [options.metadata] - Additional data
 * @param {string} [options.ipAddress]
 * @param {string} [options.userAgent]
 */
async function logAudit(options) {
  const {
    userId,
    action,
    resourceType = null,
    resourceId = null,
    metadata = null,
    ipAddress = null,
    userAgent = null,
  } = options;
  const last = await AuditLog.findOne().sort({ createdAt: -1, _id: -1 }).select('entryHash').lean();
  const prevHash = last?.entryHash || null;
  const hashPayload = {
    userId: userId?.toString() || null,
    action,
    resourceType,
    resourceId,
    metadata,
    ipAddress,
    userAgent,
    prevHash,
    ts: new Date().toISOString(),
  };
  const entryHash = computeAuditEntryHash(hashPayload);

  const doc = await AuditLog.create({
    userId,
    action,
    resourceType,
    resourceId,
    metadata,
    ipAddress,
    userAgent,
    prevHash,
    entryHash,
  });
  emitGlobal('audit_log_new', {
    id: doc._id.toString(),
    action: doc.action,
    resource_type: doc.resourceType,
    resource_id: doc.resourceId,
    created_at: doc.createdAt,
  });
}

/**
 * Create a logger that includes req for ip/userAgent. Use in controllers.
 * logAuditFromReq(req, { action: 'login', userId: user._id })
 */
function logAuditFromReq(req, options) {
  const userId = options.userId || (req.user && req.user._id && req.user._id.toString());
  return logAudit({
    ...options,
    userId,
    ipAddress: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.get ? req.get('user-agent') : null,
  });
}

module.exports = { logAudit, logAuditFromReq };
