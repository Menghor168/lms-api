const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/circulationController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.post('/checkout', authorize('Admin', 'Staff'), ctrl.checkOut);
router.post('/return/:id', authorize('Admin', 'Staff'), ctrl.returnBook);
router.get('/transactions', ctrl.getAllTransactions);
router.get('/transactions/:id', ctrl.getTransactionById);
router.get('/alerts/overdue', authorize('Admin', 'Staff'), ctrl.alertUser);

router.get('/fines', authorize('Admin', 'Staff'), ctrl.getAllFines);
router.get('/fines/member/:id', ctrl.getFinesByMember);
router.post('/fines/:id/pay', ctrl.payFine);

module.exports = router;
