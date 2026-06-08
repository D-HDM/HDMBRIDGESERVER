const nodemailer = require('nodemailer');
const Handlebars = require('handlebars');
const EmailLog = require('../models/client/EmailLog');
const Template = require('../models/client/Template');
const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/common/errorHandler');

class EmailService {
  constructor() {
    this.transporter = null;
  }

  async initTransporter() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    try {
      await this.transporter.verify();
      console.log('✅ SMTP Connection Verified');
    } catch (error) {
      console.error('❌ SMTP Connection Failed:', error.message);
    }
  }

  generateMessageId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return 'hdm_' + timestamp + '_' + random;
  }

  async renderTemplate(templateId, variables) {
    const template = await Template.findById(templateId);
    if (!template) {
      throw new AppError('Template not found', 404, 'TEMPLATE_001');
    }

    const compiledHtml = Handlebars.compile(template.htmlContent);
    const compiledText = template.textContent ? Handlebars.compile(template.textContent) : null;

    const htmlBody = compiledHtml(variables);
    const textBody = compiledText ? compiledText(variables) : null;
    const subject = Handlebars.compile(template.subject)(variables);

    return { subject, htmlBody, textBody, template };
  }

  addTracking(htmlBody, messageId) {
    if (!htmlBody) return htmlBody;

    const trackingBaseUrl = process.env.TRACKING_BASE_URL || process.env.BASE_URL;
    const openPixel = '<img src="' + trackingBaseUrl + '/api/track/open/' + messageId + '" width="1" height="1" alt="" style="display:none;" />';

    let trackedHtml = htmlBody.replace(
      /<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/gi,
      (match, url, rest) => {
        if (url.startsWith('mailto:') || url.startsWith('#') || url.startsWith('tel:')) {
          return match;
        }
        const encodedUrl = encodeURIComponent(url);
        return '<a href="' + trackingBaseUrl + '/api/track/click/' + messageId + '?url=' + encodedUrl + '"' + rest + '>';
      }
    );

    return trackedHtml + openPixel;
  }

  async sendEmail(emailData) {
    const startTime = Date.now();

    try {
      const messageId = emailData.messageId || this.generateMessageId();

      let htmlBody = emailData.htmlBody;
      let textBody = emailData.textBody;
      let subject = emailData.subject;

      if (emailData.templateId) {
        const rendered = await this.renderTemplate(emailData.templateId, emailData.variables || {});
        htmlBody = rendered.htmlBody;
        textBody = rendered.textBody;
        subject = rendered.subject;
      }

      if (emailData.tracking !== false) {
        htmlBody = this.addTracking(htmlBody, messageId);
      }

      const mailOptions = {
        from: {
          name: emailData.fromName || process.env.SMTP_FROM_NAME || 'HDM BRIDGE',
          address: emailData.from || process.env.SMTP_FROM_EMAIL,
        },
        to: emailData.to,
        subject: subject,
        html: htmlBody,
        text: textBody,
        replyTo: emailData.replyTo,
        headers: {
          'X-Message-ID': messageId,
          'X-Entity-Ref-ID': messageId,
        },
      };

      if (emailData.attachments && emailData.attachments.length > 0) {
        mailOptions.attachments = emailData.attachments.map(function(att) {
          return {
            filename: att.filename,
            content: Buffer.from(att.content, 'base64'),
            contentType: att.type || 'application/octet-stream',
          };
        });
      }

      const info = await this.transporter.sendMail(mailOptions);

      await this.incrementUsageCounter(emailData.organizationId);

      const duration = Date.now() - startTime;
      logger.info('Email sent: ' + messageId + ' - ' + duration + 'ms');

      return {
        success: true,
        messageId: messageId,
        status: 'sent',
        duration: duration,
      };

    } catch (error) {
      logger.error('Email send failed: ' + error.message);

      const currentLog = await EmailLog.findOne({ messageId: emailData.messageId });
      if (currentLog) {
        const attempts = (currentLog.deliveryDetails?.attempts || 0) + 1;
        await EmailLog.updateOne(
          { messageId: emailData.messageId },
          {
            $set: {
              status: 'failed',
              'deliveryDetails.attempts': attempts,
              'deliveryDetails.lastAttempt': new Date(),
              'deliveryDetails.smtpResponse': error.message,
            },
          }
        );
      }

      throw new AppError('Email sending failed: ' + error.message, 502, 'EMAIL_SEND_FAILED');
    }
  }

  async incrementUsageCounter(organizationId) {
    try {
      const redis = getRedisClient();
      const today = new Date().toISOString().split('T')[0];
      const month = today.substring(0, 7);

      await redis.incr('usage:' + organizationId + ':daily:' + today);
      await redis.incr('usage:' + organizationId + ':monthly:' + month);
      await redis.expire('usage:' + organizationId + ':daily:' + today, 86400);
      await redis.expire('usage:' + organizationId + ':monthly:' + month, 2592000);
    } catch (error) {
      logger.error('Failed to increment usage: ' + error.message);
    }
  }

  async handleOpen(messageId, userAgent, ip) {
    try {
      const currentLog = await EmailLog.findOne({ messageId: messageId });
      if (currentLog) {
        const openCount = (currentLog.tracking?.openCount || 0) + 1;
        await EmailLog.updateOne(
          { messageId: messageId },
          {
            $set: {
              'tracking.opened': true,
              'tracking.openIP': ip,
              'tracking.openUserAgent': userAgent,
              'tracking.openedAt': new Date(),
              'tracking.openCount': openCount,
              status: 'opened',
            },
          }
        );
      }
    } catch (error) {
      logger.error('Open tracking failed: ' + error.message);
    }
  }

  async handleClick(messageId, url, userAgent, ip) {
    try {
      const currentLog = await EmailLog.findOne({ messageId: messageId });
      if (currentLog) {
        const clickCount = (currentLog.tracking?.clickCount || 0) + 1;
        await EmailLog.updateOne(
          { messageId: messageId },
          {
            $set: {
              'tracking.clicked': true,
              'tracking.clickedUrl': url,
              'tracking.clickIP': ip,
              'tracking.clickUserAgent': userAgent,
              'tracking.clickedAt': new Date(),
              'tracking.clickCount': clickCount,
              status: 'clicked',
            },
          }
        );
      }
    } catch (error) {
      logger.error('Click tracking failed: ' + error.message);
    }
  }
}

module.exports = new EmailService();