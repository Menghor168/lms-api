const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/serviceController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.post('/attendance', authorize('Admin', 'Staff'), ctrl.logAttendance);
router.patch('/attendance/:id/exit', authorize('Admin', 'Staff'), ctrl.logExit);
router.get('/attendance', authorize('Admin', 'Staff'), ctrl.getAllAttendance);
router.get('/attendance/report', authorize('Admin', 'Staff'), ctrl.generateAttendanceReport);

router.post('/reservations', ctrl.reserveBook);
router.get('/reservations', authorize('Admin', 'Staff'), ctrl.getAllReservations);

module.exports = router;
