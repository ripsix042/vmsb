const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { logAudit } = require('./auditLog');

const MIN_AUDIT_RETENTION_DAYS = 365;
const MAX_AUDIT_RETENTION_DAYS = 1095;

function getAuditRetentionDays() {
  const raw = Number(process.env.AUDIT_RETENTION_DAYS || 365);
  const days = Number.isFinite(raw) ? raw : 365;
  return Math.max(MIN_AUDIT_RETENTION_DAYS, Math.min(MAX_AUDIT_RETENTION_DAYS, days));
}

function getSystemAuditUserId() {
  const raw = process.env.AUDIT_RETENTION_SYSTEM_USER_ID;
  if (!raw || !mongoose.isValidObjectId(raw)) return null;
  return raw;
}

/**
 * Delete audit log entries older than the retention window.
 */
async function purgeAuditLogsOlderThan(retentionDays = getAuditRetentionDays()) {
  const days = Math.max(MIN_AUDIT_RETENTION_DAYS, retentionDays);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
  return {
    retentionDays: days,
    cutoff: cutoff.toISOString(),
    deletedCount: result.deletedCount || 0,
  };
}

/**
 * Scheduled job: purge old audit logs and record audit_retention_auto.
 */
async function runScheduledAuditRetention() {
  const purgeResult = await purgeAuditLogsOlderThan();
  const systemUserId = getSystemAuditUserId();

  if (!systemUserId) {
    console.warn(
      '[audit-retention] AUDIT_RETENTION_SYSTEM_USER_ID not set; skipped audit_retention_auto log entry'
    );
    return { ...purgeResult, auditLogged: false };
  }

  await logAudit({
    userId: systemUserId,
    action: 'audit_retention_auto',
    resourceType: 'AuditLog',
    resourceId: null,
    metadata: {
      retention_days: purgeResult.retentionDays,
      deleted_count: purgeResult.deletedCount,
      cutoff: purgeResult.cutoff,
      summary: `Automatic audit retention purge (${purgeResult.deletedCount} entries removed)`,
    },
    ipAddress: 'system',
    userAgent: 'audit-retention-job',
  });

  return { ...purgeResult, auditLogged: true };
}

module.exports = {
  getAuditRetentionDays,
  purgeAuditLogsOlderThan,
  runScheduledAuditRetention,
  MIN_AUDIT_RETENTION_DAYS,
};
