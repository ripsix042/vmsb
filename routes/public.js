const express = require('express');
const { getReasons } = require('../controllers/publicController');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const { RATE_LIMITS } = require('../config/security');

const publicLimiter = rateLimit({
  windowMs: RATE_LIMITS.public.windowMs,
  max: RATE_LIMITS.public.max,
  message: { error: 'Too many requests', message: 'Try again in a minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(publicLimiter);
router.get('/reasons', getReasons);

module.exports = router;
