const express = require('express');
const {
  getIntegrationSettings,
  updateIntegrationSettings,
} = require('../controllers/settingsController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');

const router = express.Router();

router.use(authenticate);

router.get('/', getIntegrationSettings);
router.patch('/', requireAdmin, updateIntegrationSettings);

module.exports = router;
