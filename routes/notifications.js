const express = require('express');
const {
  listNotifications,
  createNotification,
  markRead,
  markAllRead,
  clearNotifications,
} = require('../controllers/notificationsController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createNotificationSchema } = require('../validators/notifications');

const router = express.Router();

router.use(authenticate);

router.get('/', listNotifications);
router.post('/', validate(createNotificationSchema), createNotification);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markRead);
router.delete('/', clearNotifications);

module.exports = router;
