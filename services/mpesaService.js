const axios = require('axios');
const Transaction = require('../models/client/Transaction');
const Subscription = require('../models/client/Subscription');
const PaymentMethod = require('../models/admin/PaymentMethod');
const logger = require('../utils/logger');

class MpesaService {
  constructor() {
    this.baseURL = process.env.MPESA_ENVIRONMENT === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    try {
      const auth = Buffer.from(
        `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
      ).toString('base64');

      const response = await axios.get(
        `${this.baseURL}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: { Authorization: `Basic ${auth}` },
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;

      return this.accessToken;
    } catch (error) {
      logger.error('M-Pesa auth failed:', error.message);
      throw error;
    }
  }

  async getPaymentConfig() {
    const paymentMethod = await PaymentMethod.findOne({
      type: 'mpesa',
      isEnabled: true,
    });

    if (!paymentMethod) {
      throw new Error('M-Pesa is not enabled');
    }

    return {
      paybillNumber: paymentMethod.configuration.paybillNumber,
      tillNumber: paymentMethod.configuration.tillNumber,
      shortcode: paymentMethod.configuration.shortcode || process.env.MPESA_SHORTCODE,
      passkey: paymentMethod.configuration.passkey || process.env.MPESA_PASSKEY,
    };
  }

  async stkPush(phoneNumber, amount, accountReference, description) {
    try {
      const token = await this.getAccessToken();
      const config = await this.getPaymentConfig();
      const timestamp = this.generateTimestamp();
      const password = this.generatePassword(config.shortcode, config.passkey, timestamp);

      const payload = {
        BusinessShortCode: config.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(amount),
        PartyA: phoneNumber,
        PartyB: config.shortcode,
        PhoneNumber: phoneNumber,
        CallBackURL: `${process.env.BASE_URL}/api/payments/mpesa/callback`,
        AccountReference: accountReference || 'HDM Bridge',
        TransactionDesc: description || 'Subscription Payment',
      };

      const response = await axios.post(
        `${this.baseURL}/mpesa/stkpush/v1/processrequest`,
        payload,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      return {
        success: true,
        merchantRequestId: response.data.MerchantRequestID,
        checkoutRequestId: response.data.CheckoutRequestID,
        responseCode: response.data.ResponseCode,
        responseDescription: response.data.ResponseDescription,
      };
    } catch (error) {
      logger.error('M-Pesa STK Push failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async queryStatus(checkoutRequestId) {
    try {
      const token = await this.getAccessToken();
      const config = await this.getPaymentConfig();
      const timestamp = this.generateTimestamp();
      const password = this.generatePassword(config.shortcode, config.passkey, timestamp);

      const response = await axios.post(
        `${this.baseURL}/mpesa/stkpushquery/v1/query`,
        {
          BusinessShortCode: config.shortcode,
          Password: password,
          Timestamp: timestamp,
          CheckoutRequestID: checkoutRequestId,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      return response.data;
    } catch (error) {
      logger.error('M-Pesa query failed:', error.message);
      throw error;
    }
  }

  async handleCallback(callbackData) {
    try {
      const { Body } = callbackData;
      const { stkCallback } = Body;
      const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

      const isSuccess = ResultCode === 0;
      let transactionDetails = {};

      if (isSuccess && CallbackMetadata) {
        const items = CallbackMetadata.Item;
        transactionDetails = {
          amount: items.find(i => i.Name === 'Amount')?.Value,
          mpesaReceiptNumber: items.find(i => i.Name === 'MpesaReceiptNumber')?.Value,
          transactionDate: items.find(i => i.Name === 'TransactionDate')?.Value,
          phoneNumber: items.find(i => i.Name === 'PhoneNumber')?.Value,
        };
      }

      // Update transaction
      await Transaction.findOneAndUpdate(
        { 'mpesaDetails.checkoutRequestId': CheckoutRequestID },
        {
          status: isSuccess ? 'completed' : 'failed',
          'mpesaDetails.resultCode': ResultCode,
          'mpesaDetails.resultDesc': ResultDesc,
          'mpesaDetails.mpesaReceiptNumber': transactionDetails.mpesaReceiptNumber,
          'mpesaDetails.phoneNumber': transactionDetails.phoneNumber,
          'mpesaDetails.transactionDate': transactionDetails.transactionDate,
        }
      );

      return { success: isSuccess, resultCode: ResultCode, resultDesc: ResultDesc };
    } catch (error) {
      logger.error('M-Pesa callback processing failed:', error.message);
      throw error;
    }
  }

  generateTimestamp() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  generatePassword(shortcode, passkey, timestamp) {
    const crypto = require('crypto');
    const data = `${shortcode}${passkey}${timestamp}`;
    return crypto.createHash('base64').update(data).digest('base64');
  }
}

module.exports = new MpesaService();