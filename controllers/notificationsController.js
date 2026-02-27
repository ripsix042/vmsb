const Notification = require('../models/Notification');
const { notFound } = require('../utils/errors');

function notificationToApi(n) {
  const doc = n.toObject ? n.toObject() : n;
  return {
    id: doc._id.toString(),
    type: doc.type,
    title: doc.title || '',
    message: doc.body || doc.message || '',
    body: doc.body,
    visitor_id: doc.relatedVisitId ? doc.relatedVisitId.toString() : null,
    host_id: doc.userId.toString(),
    read: !!doc.readAt,
    read_at: doc.readAt,
    created_at: doc.createdAt,
  };
}

async function listNotifications(req, res, next) {
  try {
    const { hostId } = req.query;
    const userId = hostId ? hostId : req.user._id.toString();
    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .lean();
    const list = notifications.map((n) => notificationToApi(n));
    res.json({ notifications: list });
  } catch (err) {
    next(err);
  }
}

async function createNotification(req, res, next) {
  try {
    const { type, message, title, body, visitor_id, host_id, read } = req.body;
    const doc = await Notification.create({
      userId: host_id,
      type,
      title: title || '',
      body: body || message || '',
      relatedVisitId: visitor_id || null,
      readAt: read ? new Date() : null,
    });
    res.status(201).json(notificationToApi(doc));
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { readAt: new Date() },
      { new: true }
    );
    if (!notification) throw notFound('Notification not found');
    res.json(notificationToApi(notification));
  } catch (err) {
    next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    await Notification.updateMany(
      { userId: req.user._id, readAt: null },
      { readAt: new Date() }
    );
    res.json({ updated: true });
  } catch (err) {
    next(err);
  }
}

async function clearNotifications(req, res, next) {
  try {
    await Notification.deleteMany({ userId: req.user._id });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listNotifications,
  createNotification,
  markRead,
  markAllRead,
  clearNotifications,
};
