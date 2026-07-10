const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bookController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', ctrl.getAllCategories);
router.get('/sorted', ctrl.sortCategory);
router.get('/:id', ctrl.getCategoryById);
router.post('/', authenticate, authorize('Admin', 'Staff'), ctrl.addCategory);
router.put('/:id', authenticate, authorize('Admin', 'Staff'), ctrl.editCategory);
router.delete('/:id', authenticate, authorize('Admin', 'Staff'), ctrl.deleteCategory);

module.exports = router;
