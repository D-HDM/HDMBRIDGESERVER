const router = require('express').Router();
const { getCurrencies, updateCurrency, toggleCurrency, getExchangeRates, updateExchangeRates, setDefaultCurrency } = require('../../controllers/admin/adminCurrencyController');
const { adminAuth, checkPermission } = require('../../middleware/admin/adminAuth');
const { auditLog } = require('../../middleware/admin/adminAudit');

router.get('/', adminAuth, checkPermission('currency.view'), getCurrencies);
router.put('/:id', adminAuth, checkPermission('currency.edit'), auditLog('update', 'currency'), updateCurrency);
router.put('/:id/toggle', adminAuth, checkPermission('currency.edit'), auditLog('toggle', 'currency'), toggleCurrency);
router.put('/default/:id', adminAuth, checkPermission('currency.edit'), auditLog('set_default', 'currency'), setDefaultCurrency);
router.get('/rates/all', adminAuth, checkPermission('currency.view'), getExchangeRates);
router.post('/rates', adminAuth, checkPermission('currency.edit'), auditLog('update_rates', 'currency'), updateExchangeRates);

module.exports = router;