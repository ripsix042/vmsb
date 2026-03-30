const express = require('express');
const { listDepartments } = require('../controllers/departmentsController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/', listDepartments);

module.exports = router;
