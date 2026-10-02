const router = require('express').Router();
const {
  getSubscription,
  getPlans,
  getUsage,
  createInvoice,
  getInvoice,
  getPendingInvoice,
  payInvoice,
  getTransactions,
  getMpesaStatus,
  createCheckout,
  mpesaPayment,
  paypalPayment,
  manualPayment,
} = require('../../controllers/client/billingController');
const auth = require('../../middleware/common/auth');
const tenantIsolation = require('../../middleware/common/tenantIsolation');

router.get('/subscription', auth, tenantIsolation, getSubscription);
router.get('/plans', auth, getPlans);
router.get('/usage', auth, tenantIsolation, getUsage);
router.get('/transactions', auth, tenantIsolation, getTransactions);

router.post('/invoice', auth, tenantIsolation, createInvoice);
router.get('/invoice/pending/current', auth, tenantIsolation, getPendingInvoice);
router.get('/invoice/:invoiceNumber', auth, tenantIsolation, getInvoice);
router.post('/invoice/:invoiceNumber/pay', auth, tenantIsolation, payInvoice);

router.get('/mpesa/status/:checkoutRequestId', auth, tenantIsolation, getMpesaStatus);

router.post('/checkout', auth, tenantIsolation, createCheckout);
router.post('/mpesa', auth, tenantIsolation, mpesaPayment);
router.post('/paypal', auth, tenantIsolation, paypalPayment);
router.post('/manual-payment', auth, tenantIsolation, manualPayment);

module.exports = router;