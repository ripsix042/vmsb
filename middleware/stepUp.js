const User = require('../models/User');
const { unauthorized, forbidden } = require('../utils/errors');
const { verifyCode } = require('../services/totp');

async function requireStepUp(req, res, next) {
  try {
    if (!req.user?._id) throw unauthorized('Authentication required');
    const { step_up_password: stepUpPassword, step_up_code: stepUpCode } = req.body || {};
    if (!stepUpPassword) throw unauthorized('Step-up password is required');

    const user = await User.findById(req.user._id).select('+passwordHash +twoFactorSecret +twoFactorEnabled');
    if (!user) throw unauthorized('User not found');
    const passwordOk = await user.comparePassword(stepUpPassword);
    if (!passwordOk) throw unauthorized('Step-up authentication failed');

    if (user.twoFactorEnabled) {
      if (!stepUpCode || !verifyCode(user.twoFactorSecret, String(stepUpCode))) {
        throw unauthorized('Step-up 2FA code is required');
      }
    }

    req.stepUp = { verified: true, at: new Date().toISOString() };
    return next();
  } catch (err) {
    if (err.statusCode) return next(err);
    return next(forbidden('Step-up authentication failed'));
  }
}

module.exports = { requireStepUp };
