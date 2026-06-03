const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/roleCheck');
const { getSummary, exportAnalytics } = require('../controllers/analyticsController');

const router = express.Router();

router.use(authenticate, requireSuperAdmin);

router.get('/summary', getSummary);
router.get('/export', exportAnalytics);

module.exports = router;
