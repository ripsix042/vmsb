const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      required: true,
      enum: ['check-in', 'check-out', 'pre-registration', 'walk_in_request'],
    },
    title: { type: String, trim: true, default: '' },
    body: { type: String, required: true },
    relatedVisitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1 });
notificationSchema.index({ readAt: 1 });
notificationSchema.index({ createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;
