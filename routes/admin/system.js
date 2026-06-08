const router = require('express').Router();
const { getSettings, getPublicSettings, updateSetting, bulkUpdateSettings, getPaymentMethods, getPublicPaymentMethods, updatePaymentMethod, togglePaymentMethod, getSystemHealth } = require('../../controllers/admin/adminSystemController');
const { adminAuth, checkPermission } = require('../../middleware/admin/adminAuth');
const { auditLog } = require('../../middleware/admin/adminAudit');

router.get('/public', getPublicSettings);
router.get('/payment-methods/public', getPublicPaymentMethods);
router.get('/', adminAuth, checkPermission('system.view'), getSettings);
router.put('/', adminAuth, checkPermission('system.edit'), auditLog('update', 'system'), updateSetting);
router.put('/bulk', adminAuth, checkPermission('system.edit'), auditLog('bulk_update', 'system'), bulkUpdateSettings);
router.get('/health', adminAuth, getSystemHealth);
router.get('/payment-methods', adminAuth, checkPermission('system.view'), getPaymentMethods);
router.put('/payment-methods/:id', adminAuth, checkPermission('system.edit'), auditLog('update', 'payment_method'), updatePaymentMethod);
router.put('/payment-methods/:id/toggle', adminAuth, checkPermission('system.edit'), auditLog('toggle', 'payment_method'), togglePaymentMethod);

module.exports = router;