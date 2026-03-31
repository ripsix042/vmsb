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

async function verifyAuditChainIntegrity({ limit = 5000 } = {}) {
  const docs = await AuditLog.find()
    .sort({ createdAt: 1, _id: 1 })
    .limit(Math.max(1, Math.min(50000, Number(limit) || 5000)))
    .select('_id prevHash entryHash createdAt action userId')
    .lean();
  const issues = [];
  let previousHash = null;
  docs.forEach((doc, idx) => {
    if (idx === 0 && doc.prevHash) {
      issues.push({ id: doc._id.toString(), reason: 'first_entry_prev_hash_not_null' });
    }
    if (idx > 0 && doc.prevHash !== previousHash) {
      issues.push({
        id: doc._id.toString(),
        reason: 'prev_hash_mismatch',
        expected: previousHash,
        actual: doc.prevHash || null,
      });
    }
    if (!doc.entryHash || typeof doc.entryHash !== 'string' || doc.entryHash.length < 40) {
      issues.push({ id: doc._id.toString(), reason: 'entry_hash_missing_or_invalid' });
    }
    previousHash = doc.entryHash || null;
  });
  return {
    checked: docs.length,
    valid: issues.length === 0,
    issues,
    lastEntryHash: previousHash,
  };
}

async function buildInsiderRiskReport({ sinceDays = 30, readThreshold = 200 } = {}) {
  const since = new Date(Date.now() - Math.max(1, Number(sinceDays) || 30) * 24 * 60 * 60 * 1000);
  const docs = await AuditLog.find({ createdAt: { $gte: since } })
    .select('userId action createdAt')
    .lean();
  const perUser = new Map();
  docs.forEach((d) => {
    const key = d.userId?.toString() || 'unknown';
    if (!perUser.has(key)) perUser.set(key, { user_id: key, reads: 0, exports: 0, total: 0, last_action_at: null });
    const entry = perUser.get(key);
    const action = String(d.action || '').toLowerCase();
    if (action.includes('list') || action.includes('view') || action.includes('lookup')) entry.reads += 1;
    if (action.includes('export')) entry.exports += 1;
    entry.total += 1;
    entry.last_action_at = d.createdAt;
  });
  const actors = Array.from(perUser.values())
    .map((a) => ({ ...a, flagged: a.reads >= readThreshold || a.exports >= 20 }))
    .sort((a, b) => b.total - a.total);
  return {
    window_start: since.toISOString(),
    window_days: Math.max(1, Number(sinceDays) || 30),
    thresholds: { reads: readThreshold, exports: 20 },
    actor_count: actors.length,
    flagged_count: actors.filter((a) => a.flagged).length,
    actors,
  };
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

module.exports = { logAudit, logAuditFromReq, verifyAuditChainIntegrity, buildInsiderRiskReport };
