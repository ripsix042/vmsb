const express = require('express');
const rateLimit = require('express-rate-limit');
const { login, refresh, logout, me, register, kioskRegister } = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { loginSchema, registerSchema, kioskRegisterSchema } = require('../validators/auth');
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

router.get('/me', authenticate, me);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/register', validate(registerSchema), register);
router.post('/kiosk/register', validate(kioskRegisterSchema), kioskRegister);
router.post('/refresh', refreshLimiter, refresh);
router.post('/logout', logout);

module.exports = router;
