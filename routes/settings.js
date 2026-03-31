const express = require('express');
const {
  getSettings,
  updateSettings,
  purgeRetentionData,
} = require('../controllers/settingsController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');

const router = express.Router();

router.use(authenticate);

router.get('/', getSettings);
router.patch('/', requireAdmin, updateSettings);
router.post('/retention/purge', requireAdmin, purgeRetentionData);

module.exports = router;
