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
  resetStaffPassword,
  bulkCreateStaff,
} = require('../controllers/usersController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');
const { requireStepUp } = require('../middleware/stepUp');
const { validate } = require('../middleware/validate');
const {
  updateMeSchema,
  createStaffSchema,
  updateStaffRoleSchema,
  updateStaffStatusSchema,
  setMyDepartmentSchema,
  resetStaffPasswordSchema,
  bulkCreateStaffSchema,
} = require('../validators/users');

const router = express.Router();

router.use(authenticate);

router.get('/me', getMe);
router.patch('/me/department', validate(setMyDepartmentSchema), setMyDepartment);
router.patch('/me', validate(updateMeSchema), updateMe);
router.get('/hosts', listHosts);
router.get('/staff', requireAdmin, listStaff);
router.post('/staff', requireAdmin, validate(createStaffSchema), createStaff);
router.post('/staff/bulk', requireAdmin, validate(bulkCreateStaffSchema), requireStepUp, bulkCreateStaff);
router.get('/:userId/profile', getProfileById);
router.patch('/staff/:userId/role', requireAdmin, validate(updateStaffRoleSchema), requireStepUp, updateStaffRole);
router.patch('/staff/:userId/status', requireAdmin, validate(updateStaffStatusSchema), requireStepUp, updateStaffStatus);
router.delete('/staff/:userId', requireAdmin, requireStepUp, deleteStaff);
router.post(
  '/staff/:userId/reset-password',
  requireAdmin,
  validate(resetStaffPasswordSchema),
  requireStepUp,
  resetStaffPassword
);

module.exports = router;
