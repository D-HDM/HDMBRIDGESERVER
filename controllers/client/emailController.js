const EmailLog = require('../../models/client/EmailLog');
const emailService = require('../../services/emailService');
const queueService = require('../../services/queueService');
const rateLimitService = require('../../services/rateLimitService');
const { AppError } = require('../../middleware/common/errorHandler');
const Helpers = require('../../utils/helpers');
const logger = require('../../utils/logger');

// @desc    Send email
// @route   POST /api/emails/send
// @access  Private (API Key or JWT)
const sendEmail = async (req, res, next) => {
  try {
    const { from, fromName, to, subject, htmlBody, textBody, replyTo, templateId, variables, attachments, priority, tags } = req.body;

    // Check rate limit
    const rateCheck = await rateLimitService.checkLimit(req.organizationId, 'dailyEmails');
    if (!rateCheck.allowed) {
      return next(new AppError('Daily email limit exceeded', 429, 'LIMIT_001'));
    }

    // Build email data
    const emailData = {
      organizationId: req.organizationId,
      userId: req.user?._id,
      apiKeyId: req.apiKey?._id,
      messageId: emailService.generateMessageId(),
      from: from || process.env.SMTP_FROM_EMAIL,
      fromName: fromName || process.env.SMTP_FROM_NAME,
      to,
      subject,
      htmlBody,
      textBody,
      replyTo,
      templateId,
      variables,
      attachments,
      priority: priority || 'normal',
      tags: tags || [],
      tracking: req.body.tracking !== false,
    };

    // Add to queue
    const job = await queueService.addToQueue(emailData, priority);

    // Log to database
    await EmailLog.create({
      organizationId: req.organizationId,
      userId: req.user?._id,
      apiKeyId: req.apiKey?._id,
      messageId: emailData.messageId,
      from: { email: emailData.from, name: emailData.fromName },
      to: Array.isArray(to) ? to[0] : { email: to },
      subject,
      htmlBody,
      textBody,
      status: 'queued',
      priority: emailData.priority,
      tags: emailData.tags,
    });

    logger.info(`Email queued: ${emailData.messageId}`);

    res.status(200).json({
      success: true,
      messageId: emailData.messageId,
      status: 'queued',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send bulk emails
// @route   POST /api/emails/send-bulk
// @access  Private (API Key or JWT)
const sendBulkEmails = async (req, res, next) => {
  try {
    const { emails } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return next(new AppError('Emails array is required', 400, 'VALIDATION_001'));
    }

    const results = [];
    const errors = [];

    for (const emailData of emails) {
      try {
        const emailPayload = {
          organizationId: req.organizationId,
          userId: req.user?._id,
          apiKeyId: req.apiKey?._id,
          messageId: emailService.generateMessageId(),
          ...emailData,
        };

        await queueService.addToQueue(emailPayload, emailData.priority || 'normal');
        results.push({ email: emailData.to, messageId: emailPayload.messageId, status: 'queued' });
      } catch (error) {
        errors.push({ email: emailData.to, error: error.message });
      }
    }

    res.status(200).json({
      success: true,
      queued: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get email status
// @route   GET /api/emails/status/:messageId
// @access  Private
const getEmailStatus = async (req, res, next) => {
  try {
    const { messageId } = req.params;

    const emailLog = await EmailLog.findOne({
      messageId,
      organizationId: req.organizationId,
    }).select('messageId status from to subject deliveryDetails tracking bounce spam createdAt');

    if (!emailLog) {
      return next(new AppError('Email not found', 404, 'NOT_FOUND'));
    }

    res.status(200).json({
      success: true,
      email: emailLog,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Handle open tracking
// @route   GET /api/track/open/:messageId
// @access  Public
const trackOpen = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const userAgent = req.headers['user-agent'];
    const ip = req.ip;

    await emailService.handleOpen(messageId, userAgent, ip);

    // Return 1x1 transparent pixel
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(pixel);
  } catch (error) {
    // Silently handle errors for tracking
    res.status(200).end();
  }
};

// @desc    Handle click tracking
// @route   GET /api/track/click/:messageId
// @access  Public
const trackClick = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { url, org } = req.query;
    const userAgent = req.headers['user-agent'];
    const ip = req.ip;

    if (!url) {
      return res.redirect('/');
    }

    await emailService.handleClick(messageId, decodeURIComponent(url), userAgent, ip);

    res.redirect(decodeURIComponent(url));
  } catch (error) {
    res.redirect(req.query.url || '/');
  }
};

module.exports = {
  sendEmail,
  sendBulkEmails,
  getEmailStatus,
  trackOpen,
  trackClick,
};