const express = require('express');
const {
  getMe,
  updateMe,
  setMyDepartment,
  getProfileById,
  listHosts,
  listStaff,
  createStaff,
  updateStaffRole,
  updateStaffStatus,
  deleteStaff,
} = require('../controllers/usersController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');
const { validate } = require('../middleware/validate');
const {
  updateMeSchema,
  createStaffSchema,
  updateStaffRoleSchema,
  updateStaffStatusSchema,
  setMyDepartmentSchema,
} = require('../validators/users');

const router = express.Router();

router.use(authenticate);

router.get('/me', getMe);
router.patch('/me/department', validate(setMyDepartmentSchema), setMyDepartment);
router.patch('/me', validate(updateMeSchema), updateMe);
router.get('/hosts', listHosts);
router.get('/staff', requireAdmin, listStaff);
router.post('/staff', requireAdmin, validate(createStaffSchema), createStaff);
router.get('/:userId/profile', getProfileById);
router.patch('/staff/:userId/role', requireAdmin, validate(updateStaffRoleSchema), updateStaffRole);
router.patch('/staff/:userId/status', requireAdmin, validate(updateStaffStatusSchema), updateStaffStatus);
router.delete('/staff/:userId', requireAdmin, deleteStaff);

module.exports = router;
