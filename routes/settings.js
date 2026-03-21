const express = require('express');
const {
  getSettings,
  updateSettings,
  getIntegrationSettings,
  updateIntegrationSettings,
} = require('../controllers/settingsController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');

const router = express.Router();

router.use(authenticate);

router.get('/', getSettings);
router.patch('/', requireAdmin, updateSettings);

module.exports = router;
