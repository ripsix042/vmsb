const express = require('express');
const rateLimit = require('express-rate-limit');
const { login, refresh, logout } = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { loginSchema } = require('../validators/auth');
const { RATE_LIMITS } = require('../config/security');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: RATE_LIMITS.login.windowMs,
  max: RATE_LIMITS.login.max,
  message: { error: 'Too many login attempts', message: 'Try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const refreshLimiter = rateLimit({
  windowMs: RATE_LIMITS.refresh.windowMs,
  max: RATE_LIMITS.refresh.max,
  message: { error: 'Too many requests', message: 'Try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/refresh', refreshLimiter, refresh);
router.post('/logout', logout);

module.exports = router;
