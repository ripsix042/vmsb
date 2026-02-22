const mongoose = require('mongoose');

const reasonForVisitSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    sortOrder: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

reasonForVisitSchema.index({ sortOrder: 1 });

const ReasonForVisit = mongoose.model('ReasonForVisit', reasonForVisitSchema);
module.exports = ReasonForVisit;
