const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/reportController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('Admin','Staff'));
router.get('/dashboard',              ctrl.dashboardSummary);
router.get('/transactions',           ctrl.transactionReport);
router.get('/dead-stock',             ctrl.deadStockReport);
router.get('/audit-logs',             ctrl.getAuditLogs);
router.post('/sync',                  ctrl.syncData);
router.post('/backup',                ctrl.backupData);

// Excel & PDF download endpoints
router.get('/download/excel/:type',   ctrl.downloadExcel);
router.get('/download/pdf/:type',     ctrl.downloadPDF);

module.exports = router;
