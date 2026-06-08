const axios = require('axios');
const SmsLog = require('../models/client/SmsLog');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/common/errorHandler');

const BREVO_SMS_URL = 'https://api.brevo.com/v3/transactionalSMS/send';

class SmsService {
  generateMessageId() {
    return 'sms_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  }

  async sendSms(smsData) {
    const messageId = smsData.messageId || this.generateMessageId();

    try {
      const payload = {
        sender: smsData.sender || 'HDM BRIDGE',
        recipient: smsData.to,
        content: smsData.content,
        type: smsData.type || 'transactional',
        tag: smsData.tag || 'hdm-bridge',
      };

      const response = await axios.post(BREVO_SMS_URL, payload, {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
      });

      await SmsLog.create({
        organizationId: smsData.organizationId,
        userId: smsData.userId,
        messageId,
        to: smsData.to,
        content: smsData.content,
        sender: payload.sender,
        status: 'sent',
        creditsUsed: response.data?.creditsUsed || 1,
        brevoMessageId: response.data?.messageId,
      });

      logger.info('SMS sent: ' + messageId);
      return { success: true, messageId, status: 'sent', creditsUsed: response.data?.creditsUsed || 1 };

    } catch (error) {
      logger.error('SMS failed: ' + error.response?.data?.message || error.message);

      await SmsLog.create({
        organizationId: smsData.organizationId,
        userId: smsData.userId,
        messageId,
        to: smsData.to,
        content: smsData.content,
        sender: smsData.sender || 'HDM BRIDGE',
        status: 'failed',
        error: error.response?.data?.message || error.message,
      });

      throw new AppError('SMS sending failed: ' + (error.response?.data?.message || error.message), 502, 'SMS_SEND_FAILED');
    }
  }
}

module.exports = new SmsService();