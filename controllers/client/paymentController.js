const stripeService = require('../../services/stripeService');
const mpesaService = require('../../services/mpesaService');
const paypalService = require('../../services/paypalService');
const Transaction = require('../../models/client/Transaction');
const Subscription = require('../../models/client/Subscription');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

// @desc    Handle Stripe webhook
// @route   POST /api/payments/stripe/webhook
// @access  Public (Stripe signature verified)
const stripeWebhook = async (req, res, next) => {
  try {
    const payload = req.body;
    const signature = req.headers['stripe-signature'];

    const result = await stripeService.handleWebhook(
      JSON.stringify(payload),
      signature
    );

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Stripe webhook error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

// @desc    Handle M-Pesa callback
// @route   POST /api/payments/mpesa/callback
// @access  Public (M-Pesa IP whitelisted)
const mpesaCallback = async (req, res, next) => {
  try {
    const callbackData = req.body;
    const result = await mpesaService.handleCallback(callbackData);

    if (result.success) {
      // Find transaction and activate subscription
      const transaction = await Transaction.findOne({
        'mpesaDetails.checkoutRequestId': callbackData.Body.stkCallback.CheckoutRequestID,
      });

      if (transaction) {
        await Subscription.findOneAndUpdate(
          { organizationId: transaction.organizationId },
          {
            status: 'active',
            paymentMethod: 'mpesa',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
          { upsert: true }
        );
      }
    }

    logger.info('M-Pesa callback processed:', result);
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
  } catch (error) {
    logger.error('M-Pesa callback error:', error.message);
    res.status(200).json({ ResultCode: 1, ResultDesc: 'Error' });
  }
};

// @desc    Handle PayPal webhook
// @route   POST /api/payments/paypal/webhook
// @access  Public
const paypalWebhook = async (req, res, next) => {
  try {
    await paypalService.handleWebhook(req.body);
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('PayPal webhook error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

// @desc    Capture PayPal order
// @route   POST /api/payments/paypal/capture
// @access  Private
const capturePayPalOrder = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const result = await paypalService.captureOrder(orderId);
    res.status(200).json({ success: true, result });
  } catch (error) {
    next(error);
  }
};

// @desc    Check M-Pesa payment status
// @route   GET /api/payments/mpesa/status/:checkoutRequestId
// @access  Private
const checkMpesaStatus = async (req, res, next) => {
  try {
    const { checkoutRequestId } = req.params;
    const result = await mpesaService.queryStatus(checkoutRequestId);
    res.status(200).json({ success: true, result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  stripeWebhook,
  mpesaCallback,
  paypalWebhook,
  capturePayPalOrder,
  checkMpesaStatus,
};