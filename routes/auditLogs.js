const express = require('express');
const { listAuditLogs } = require('../controllers/auditLogsController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');

const router = express.Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/', listAuditLogs);

module.exports = router;
