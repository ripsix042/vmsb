const express = require('express');
const { listAuditLogs, exportAuditLogsCsv, purgeAuditLogs } = require('../controllers/auditLogsController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');

const router = express.Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/', listAuditLogs);
router.get('/export.csv', exportAuditLogsCsv);
router.post('/purge', purgeAuditLogs);

module.exports = router;
