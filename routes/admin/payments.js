const router = require('express').Router();
const { getTransactions, getTransactionById, processRefund, createManualInvoice, getSubscriptions, approvePayment, rejectPayment } = require('../../controllers/admin/adminPaymentController');
const { adminAuth, checkPermission } = require('../../middleware/admin/adminAuth');
const { auditLog } = require('../../middleware/admin/adminAudit');

router.get('/', adminAuth, checkPermission('payments.view'), getTransactions);
router.get('/subscriptions/all', adminAuth, checkPermission('payments.view'), getSubscriptions);
router.get('/:id', adminAuth, checkPermission('payments.view'), getTransactionById);
router.post('/:id/refund', adminAuth, checkPermission('payments.refund'), auditLog('refund', 'payment'), processRefund);
router.post('/:id/approve', adminAuth, checkPermission('payments.refund'), auditLog('approve', 'payment'), approvePayment);
router.post('/:id/reject', adminAuth, checkPermission('payments.refund'), auditLog('reject', 'payment'), rejectPayment);
router.post('/manual', adminAuth, checkPermission('payments.manual'), auditLog('manual_invoice', 'payment'), createManualInvoice);

module.exports = router;