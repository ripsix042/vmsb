const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  login,
  oktaLogin,
  oktaCallback,
  refresh,
  logout,
  me,
  twoFactorSetup,
  twoFactorEnable,
  twoFactorDisable,
  register,
  kioskRegister,
  otpSend,
  otpVerify,
  listKioskOperators,
  kioskSetup,
  kioskEnroll2FA,
  kioskLogin,
  verify2FA,
} = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const {
  loginSchema,
  registerSchema,
  kioskRegisterSchema,
  otpSendSchema,
  otpVerifySchema,
  kioskSetupSchema,
  kioskEnrollSchema,
  kioskLoginSchema,
  twoFactorVerifySchema,
  twoFactorEnableSchema,
  twoFactorDisableSchema,
} = require('../validators/auth');
const { RATE_LIMITS } = require('../config/security');
const { issueCsrfToken, requireCsrf } = require('../middleware/csrf');

const router = express.Router();
const allowPublicRegistration =
  process.env.ALLOW_PUBLIC_REGISTRATION === 'true' || process.env.NODE_ENV !== 'production';

function requirePublicRegistrationEnabled(req, res, next) {
  if (!allowPublicRegistration) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Public registration is disabled',
    });
  }
  return next();
}

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

const otpLimiter = rateLimit({
  windowMs: RATE_LIMITS.otp.windowMs,
  max: RATE_LIMITS.otp.max,
  message: { error: 'Too many OTP requests', message: 'Try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const kioskSetupLimiter = rateLimit({
  windowMs: RATE_LIMITS.login.windowMs,
  max: 50,
  message: { error: 'Too many setup attempts', message: 'Try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/me', authenticate, me);
router.get('/csrf-token', issueCsrfToken);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.get('/okta/login', oktaLogin);
router.get('/okta/callback', oktaCallback);
router.post('/register', requirePublicRegistrationEnabled, validate(registerSchema), register);
router.get('/kiosk/operators', listKioskOperators);
router.post('/kiosk/setup', kioskSetupLimiter, validate(kioskSetupSchema), kioskSetup);
router.post('/kiosk/2fa/enroll', otpLimiter, validate(kioskEnrollSchema), kioskEnroll2FA);
router.post('/kiosk/login', loginLimiter, validate(kioskLoginSchema), kioskLogin);
router.post('/2fa/verify', otpLimiter, validate(twoFactorVerifySchema), verify2FA);
router.post('/2fa/setup', authenticate, twoFactorSetup);
router.post('/2fa/enable', authenticate, otpLimiter, validate(twoFactorEnableSchema), twoFactorEnable);
router.post('/2fa/disable', authenticate, requireCsrf, validate(twoFactorDisableSchema), twoFactorDisable);
router.post('/kiosk/register', requirePublicRegistrationEnabled, validate(kioskRegisterSchema), kioskRegister);
router.post('/otp/send', otpLimiter, validate(otpSendSchema), otpSend);
router.post('/otp/verify', otpLimiter, validate(otpVerifySchema), otpVerify);
router.post('/refresh', refreshLimiter, requireCsrf, refresh);
router.post('/logout', authenticate, requireCsrf, logout);

module.exports = router;
