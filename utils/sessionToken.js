const jwt = require('jsonwebtoken');
const { JWT_ACCESS_EXPIRES_IN } = require('../config/security');

function signAccessToken(user) {
  const sessionVersion = user.sessionVersion ?? 0;
  return jwt.sign(
    { userId: user._id, sessionVersion },
    process.env.JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRES_IN }
  );
}

function isSessionVersionValid(decoded, user) {
  const expected = user.sessionVersion ?? 0;
  if (decoded.sessionVersion == null) return false;
  return decoded.sessionVersion === expected;
}

module.exports = { signAccessToken, isSessionVersionValid };
