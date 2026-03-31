const ReasonForVisit = require('../models/ReasonForVisit');
const User = require('../models/User');
const { ROLES, USER_STATUS } = require('../config/constants');

/**
 * GET /reasons – list reason-for-visit options (public, for walk-in form dropdown).
 */
const getReasons = async (req, res, next) => {
  try {
    const reasons = await ReasonForVisit.find().sort({ sortOrder: 1 }).lean();
    res.json(reasons);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /hosts – list hosts for public walk-in form dropdown (no auth).
 */
const getHosts = async (req, res, next) => {
  try {
    const users = await User.find({
      role: { $in: [ROLES.ADMIN, ROLES.EMPLOYEE] },
      status: USER_STATUS.ACTIVE,
    })
      .select('fullName email phone')
      .lean();
    const hosts = users.map((u) => ({
      id: u._id.toString(),
      name: u.fullName,
      // Minimize PII in public host directory.
      department: 'Staff',
    }));
    res.json({ hosts });
  } catch (err) {
    next(err);
  }
};

module.exports = { getReasons, getHosts };
