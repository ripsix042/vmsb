const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  listVisitors,
  createVisitor,
  updateVisitor,
  lookupVisitor,
} = require('../controllers/visitorsController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createVisitorSchema, updateVisitorSchema } = require('../validators/visitors');
const { RATE_LIMITS } = require('../config/security');

const router = express.Router();
const lookupLimiter = rateLimit({
  windowMs: RATE_LIMITS.visitorLookup.windowMs,
  max: RATE_LIMITS.visitorLookup.max,
  message: { error: 'Too many lookup attempts', message: 'Try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(authenticate);

router.get('/lookup', lookupLimiter, lookupVisitor);
router.get('/', listVisitors);
router.post('/', validate(createVisitorSchema), createVisitor);
router.patch('/:id', validate(updateVisitorSchema), updateVisitor);

module.exports = router;
