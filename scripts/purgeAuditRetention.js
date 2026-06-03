/**
 * Purge audit logs older than AUDIT_RETENTION_DAYS (min 365).
 * Run: npm run purge:audit-retention
 * Use with platform cron when AUDIT_RETENTION_CRON_ENABLED=false on the web service.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { runScheduledAuditRetention } = require('../services/auditRetention');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const result = await runScheduledAuditRetention();
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
