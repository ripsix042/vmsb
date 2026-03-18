const express = require('express');
const {
  createVisitRequest,
  listVisitRequests,
  updateVisitRequest,
} = require('../controllers/visitRequestsController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  createVisitRequestSchema,
  updateVisitRequestSchema,
} = require('../validators/visitRequests');

const router = express.Router();

router.post('/', validate(createVisitRequestSchema), createVisitRequest);
router.get('/', authenticate, listVisitRequests);
router.patch('/:id', authenticate, validate(updateVisitRequestSchema), updateVisitRequest);

module.exports = router;
