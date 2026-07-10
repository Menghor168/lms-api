const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/staffController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('Admin'));
router.post('/', ctrl.addStaff);
router.get('/', ctrl.getAllStaff);
router.get('/:id', ctrl.getStaffById);
router.put('/:id', ctrl.editStaff);
router.delete('/:id', ctrl.deleteStaff);
router.patch('/:id/permissions', ctrl.setPermission);

module.exports = router;
