const express = require('express');
const {
  listVisitors,
  createVisitor,
  updateVisitor,
  lookupVisitor,
} = require('../controllers/visitorsController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createVisitorSchema, updateVisitorSchema } = require('../validators/visitors');

const router = express.Router();

router.use(authenticate);

router.get('/lookup', lookupVisitor);
router.get('/', listVisitors);
router.post('/', validate(createVisitorSchema), createVisitor);
router.patch('/:id', validate(updateVisitorSchema), updateVisitor);

module.exports = router;
