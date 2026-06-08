const router = require('express').Router();
const { getSubscription, getPlans, getUsage, createCheckout, mpesaPayment, paypalPayment, getTransactions, manualPayment } = require('../../controllers/client/billingController');
const auth = require('../../middleware/common/auth');
const tenantIsolation = require('../../middleware/common/tenantIsolation');

router.get('/subscription', auth, tenantIsolation, getSubscription);
router.get('/plans', auth, getPlans);
router.get('/usage', auth, tenantIsolation, getUsage);
router.get('/transactions', auth, tenantIsolation, getTransactions);
router.post('/checkout', auth, tenantIsolation, createCheckout);
router.post('/mpesa', auth, tenantIsolation, mpesaPayment);
router.post('/paypal', auth, tenantIsolation, paypalPayment);
router.post('/manual-payment', auth, tenantIsolation, manualPayment);

module.exports = router;