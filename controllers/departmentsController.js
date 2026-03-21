const Department = require('../models/Department');

async function listDepartments(req, res, next) {
  try {
    const docs = await Department.find().sort({ name: 1 }).lean();
    const departments = docs.map((d) => ({
      id: d._id.toString(),
      name: d.name,
    }));
    res.json({ departments });
  } catch (err) {
    next(err);
  }
}

module.exports = { listDepartments };
