const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bookController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', ctrl.getAllBooks);
router.get('/status', ctrl.viewStatus);
router.get('/:id', ctrl.getBookById);
router.post('/', authenticate, authorize('Admin', 'Staff'), ctrl.addBook);
router.put('/:id', authenticate, authorize('Admin', 'Staff'), ctrl.editBook);
router.delete('/:id', authenticate, authorize('Admin', 'Staff'), ctrl.deleteBook);

module.exports = router;
