const router = require('express').Router();

const clientRoutes = require('./client/index');
const adminRoutes = require('./admin/index');
const landingRoutes = require('./landing');
const trackingRoutes = require('./tracking');
const webhookRoutes = require('./client/webhooks');
const { stripeWebhook, mpesaCallback, paypalWebhook } = require('../controllers/client/paymentController');

router.use('/api', clientRoutes);
router.use('/admin/api', adminRoutes);
router.use('/api/landing', landingRoutes);
router.use('/api/track', trackingRoutes);
router.use('/webhooks', webhookRoutes);

router.post('/api/payments/stripe/webhook', stripeWebhook);
router.post('/api/payments/mpesa/callback', mpesaCallback);
router.post('/api/payments/paypal/webhook', paypalWebhook);

module.exports = router;