const express = require('express');
const {
  listAuditLogs,
  exportAuditLogsCsv,
  auditIntegrityCheck,
  insiderRiskReport,
} = require('../controllers/auditLogsController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');

const router = express.Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/', listAuditLogs);
router.get('/integrity', auditIntegrityCheck);
router.get('/insider-report', insiderRiskReport);
router.get('/export.csv', exportAuditLogsCsv);

module.exports = router;
