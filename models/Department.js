const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
  },
  { timestamps: true }
);

departmentSchema.index({ name: 1 }, { unique: true });

const Department = mongoose.model('Department', departmentSchema);
module.exports = Department;
