const axios = require('axios');
const Transaction = require('../models/client/Transaction');
const Subscription = require('../models/client/Subscription');
const logger = require('../utils/logger');

class PayPalService {
  constructor() {
    this.baseURL = process.env.PAYPAL_MODE === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    try {
      const auth = Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
      ).toString('base64');

      const response = await axios.post(
        `${this.baseURL}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;

      return this.accessToken;
    } catch (error) {
      logger.error('PayPal auth failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async createOrder(plan, organizationId) {
    try {
      const token = await this.getAccessToken();

      const order = await axios.post(
        `${this.baseURL}/v2/checkout/orders`,
        {
          intent: 'CAPTURE',
          purchase_units: [
            {
              amount: {
                currency_code: plan.price.currency,
                value: plan.price.amount.toFixed(2),
              },
              description: `${plan.name} Plan - ${plan.description || ''}`,
              custom_id: organizationId.toString(),
            },
          ],
          application_context: {
            brand_name: 'HDM BRIDGE',
            landing_page: 'LOGIN',
            user_action: 'SUBSCRIBE_NOW',
            return_url: `${process.env.BASE_URL}/api/payments/paypal/success`,
            cancel_url: `${process.env.BASE_URL}/api/payments/paypal/cancel`,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return order.data;
    } catch (error) {
      logger.error('PayPal create order failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async captureOrder(orderId) {
    try {
      const token = await this.getAccessToken();

      const capture = await axios.post(
        `${this.baseURL}/v2/checkout/orders/${orderId}/capture`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const captureData = capture.data;
      const purchaseUnit = captureData.purchase_units[0];
      const captureDetails = purchaseUnit.payments.captures[0];

      // Create transaction record
      await Transaction.create({
        organizationId: purchaseUnit.custom_id,
        type: 'subscription',
        status: 'completed',
        amount: parseFloat(captureDetails.amount.value),
        currency: captureDetails.amount.currency_code,
        paymentMethod: 'paypal',
        paymentProvider: {
          name: 'paypal',
          transactionId: captureDetails.id,
        },
        description: 'PayPal subscription payment',
      });

      // Update subscription
      await Subscription.findOneAndUpdate(
        { organizationId: purchaseUnit.custom_id },
        {
          status: 'active',
          paymentMethod: 'paypal',
          paymentProviderSubscriptionId: captureDetails.id,
        },
        { upsert: true }
      );

      return captureData;
    } catch (error) {
      logger.error('PayPal capture order failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async createRefund(captureId, amount, reason) {
    try {
      const token = await this.getAccessToken();

      const refund = await axios.post(
        `${this.baseURL}/v2/payments/captures/${captureId}/refund`,
        {
          amount: {
            value: amount.toFixed(2),
            currency_code: 'USD',
          },
          note_to_payer: reason || 'Refund requested',
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      await Transaction.findOneAndUpdate(
        { 'paymentProvider.transactionId': captureId },
        {
          status: amount === refund.data.amount.value ? 'refunded' : 'partially_refunded',
          refundDetails: {
            refundedAt: new Date(),
            refundAmount: amount,
            reason,
            refundTransactionId: refund.data.id,
          },
        }
      );

      return refund.data;
    } catch (error) {
      logger.error('PayPal refund failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async handleWebhook(webhookData) {
    // Verify webhook signature
    // Handle various PayPal events
    const { event_type, resource } = webhookData;

    switch (event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        // Handle completed payment
        break;
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await Subscription.findOneAndUpdate(
          { paymentProviderSubscriptionId: resource.id },
          { status: 'canceled', canceledAt: new Date() }
        );
        break;
      default:
        logger.info(`Unhandled PayPal event: ${event_type}`);
    }

    return { received: true };
  }
}

module.exports = new PayPalService();