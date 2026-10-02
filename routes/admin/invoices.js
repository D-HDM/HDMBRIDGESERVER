const router = require('express').Router();
const { getInvoices, getInvoiceById, confirmInvoice, rejectInvoice } = require('../../controllers/admin/adminInvoiceController');
const { adminAuth, checkPermission } = require('../../middleware/admin/adminAuth');
const { auditLog } = require('../../middleware/admin/adminAudit');

router.get('/', adminAuth, checkPermission('payments.view'), getInvoices);
router.get('/:id', adminAuth, checkPermission('payments.view'), getInvoiceById);
router.post('/:id/confirm', adminAuth, checkPermission('payments.manual'), auditLog('confirm_invoice', 'payment'), confirmInvoice);
router.post('/:id/reject', adminAuth, checkPermission('payments.refund'), auditLog('reject_invoice', 'payment'), rejectInvoice);

module.exports = router;