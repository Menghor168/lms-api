const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/memberController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.post('/', authorize('Admin', 'Staff'), ctrl.addMember);
router.get('/', authorize('Admin', 'Staff'), ctrl.getAllMembers);
router.get('/search', authorize('Admin', 'Staff'), ctrl.searchMember);
router.get('/:id', ctrl.getMemberById);
router.get('/:id/history', ctrl.viewMemberHistory);
router.put('/:id', authorize('Admin', 'Staff'), ctrl.editMember);
router.delete('/:id', authorize('Admin', 'Staff'), ctrl.deleteMember);

module.exports = router;
