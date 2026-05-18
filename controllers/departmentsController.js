const Department = require('../models/Department');
const User = require('../models/User');
const { ROLES } = require('../config/constants');

async function listDepartments(req, res, next) {
  try {
    // Employees who already have a department do not need the full org directory.
    if (req.user.role === ROLES.EMPLOYEE) {
      const self = await User.findById(req.user._id).select('departmentId departmentName').lean();
      if (self?.departmentId) {
        return res.json({
          departments: [
            {
              id: self.departmentId.toString(),
              name: self.departmentName || 'Department',
            },
          ],
        });
      }
    }

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
