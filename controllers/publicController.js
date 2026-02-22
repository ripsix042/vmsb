const ReasonForVisit = require('../models/ReasonForVisit');

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

module.exports = { getReasons };
