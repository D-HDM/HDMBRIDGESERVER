const EmailLog = require('../../models/client/EmailLog');
const emailService = require('../../services/emailService');
const queueService = require('../../services/queueService');
const rateLimitService = require('../../services/rateLimitService');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

function attachmentBytes(att) {
  if (!att || !att.content) return 0;
  const b64 = String(att.content).replace(/^data:[^;]+;base64,/, '');
  return Math.floor((b64.length * 3) / 4);
}

function recipientCount(to) {
  if (Array.isArray(to)) return to.length;
  return to ? 1 : 0;
}

async function enforceSendLimits(organizationId, payload) {
  const limits = await rateLimitService.getPlanLimits(organizationId);

  const monthly = await rateLimitService.checkAndIncrement(organizationId, 'monthlyEmails', { dryRun: true });
  if (!monthly.allowed) {
    throw new AppError('Monthly email limit exceeded', 429, 'LIMIT_001');
  }

  const daily = await rateLimitService.checkAndIncrement(organizationId, 'dailyEmails', { dryRun: true });
  if (!daily.allowed) {
    throw new AppError('Daily email limit exceeded', 429, 'LIMIT_001');
  }

  const hourly = await rateLimitService.checkAndIncrement(organizationId, 'hourlyEmails', { dryRun: true });
  if (!hourly.allowed) {
    throw new AppError('Hourly email limit exceeded', 429, 'LIMIT_001');
  }

  const perMinute = await rateLimitService.checkAndIncrement(organizationId, 'rateLimitPerMinute', { dryRun: true });
  if (!perMinute.allowed) {
    throw new AppError('Per-minute rate limit exceeded', 429, 'LIMIT_001');
  }

  const perHour = await rateLimitService.checkAndIncrement(organizationId, 'rateLimitPerHour', { dryRun: true });
  if (!perHour.allowed) {
    throw new AppError('Per-hour rate limit exceeded', 429, 'LIMIT_001');
  }

  if (payload.attachments && payload.attachments.length > 0) {
    const maxBytes = (limits.attachmentSizeMB || 0) * 1024 * 1024;
    if (maxBytes > 0) {
      for (const att of payload.attachments) {
        if (attachmentBytes(att) > maxBytes) {
          throw new AppError(`Attachment exceeds ${limits.attachmentSizeMB}MB limit`, 429, 'LIMIT_001');
        }
      }
    }
  }

  const recipients = recipientCount(payload.to);
  const maxRecipients = limits.maxRecipientsPerEmail;
  if (typeof maxRecipients === 'number' && maxRecipients > 0 && recipients > maxRecipients) {
    throw new AppError(`Max ${maxRecipients} recipients per email`, 429, 'LIMIT_001');
  }

  return limits;
}

const sendEmail = async (req, res, next) => {
  try {
    const { from, fromName, to, subject, htmlBody, textBody, replyTo, templateId, variables, attachments, priority, tags } = req.body;

    await enforceSendLimits(req.organizationId, req.body);

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

    const incrResults = [];
    for (const t of ['monthlyEmails', 'dailyEmails', 'hourlyEmails', 'rateLimitPerMinute', 'rateLimitPerHour']) {
      const r = await rateLimitService.checkAndIncrement(req.organizationId, t, { units: 1 });
      incrResults.push({ type: t, ok: r.allowed });
      if (!r.allowed) {
        for (const prev of incrResults) {
          await rateLimitService.decrement(req.organizationId, prev.type, 1);
        }
        return next(new AppError(`${t} limit exceeded`, 429, 'LIMIT_001'));
      }
    }

    try {
      await queueService.addToQueue(emailData, emailData.priority);
    } catch (err) {
      for (const prev of incrResults) {
        await rateLimitService.decrement(req.organizationId, prev.type, 1);
      }
      throw err;
    }

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

const sendBulkEmails = async (req, res, next) => {
  try {
    const { emails } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return next(new AppError('Emails array is required', 400, 'VALIDATION_001'));
    }

    const limits = await rateLimitService.getPlanLimits(req.organizationId);
    const maxRecipients = limits.maxRecipientsPerEmail;

    const results = [];
    const errors = [];

    for (const emailData of emails) {
      try {
        if (typeof maxRecipients === 'number' && maxRecipients > 0) {
          const rc = recipientCount(emailData.to);
          if (rc > maxRecipients) {
            errors.push({ email: emailData.to, error: `Max ${maxRecipients} recipients per email` });
            continue;
          }
        }

        if (emailData.attachments && emailData.attachments.length > 0) {
          const maxBytes = (limits.attachmentSizeMB || 0) * 1024 * 1024;
          if (maxBytes > 0) {
            const tooBig = emailData.attachments.some((a) => attachmentBytes(a) > maxBytes);
            if (tooBig) {
              errors.push({ email: emailData.to, error: `Attachment exceeds ${limits.attachmentSizeMB}MB limit` });
              continue;
            }
          }
        }

        const emailPayload = {
          organizationId: req.organizationId,
          userId: req.user?._id,
          apiKeyId: req.apiKey?._id,
          messageId: emailService.generateMessageId(),
          ...emailData,
        };

        const incrResults = [];
        let blocked = false;
        for (const t of ['monthlyEmails', 'dailyEmails', 'hourlyEmails', 'rateLimitPerMinute', 'rateLimitPerHour']) {
          const r = await rateLimitService.checkAndIncrement(req.organizationId, t, { units: 1 });
          incrResults.push({ type: t, ok: r.allowed });
          if (!r.allowed) {
            blocked = true;
            for (const prev of incrResults) {
              await rateLimitService.decrement(req.organizationId, prev.type, 1);
            }
            errors.push({ email: emailData.to, error: `${t} limit exceeded` });
            break;
          }
        }
        if (blocked) continue;

        try {
          await queueService.addToQueue(emailPayload, emailData.priority || 'normal');
        } catch (err) {
          for (const prev of incrResults) {
            await rateLimitService.decrement(req.organizationId, prev.type, 1);
          }
          errors.push({ email: emailData.to, error: err.message });
          continue;
        }

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

    res.status(200).json({ success: true, email: emailLog });
  } catch (error) {
    next(error);
  }
};

const trackOpen = async (req, res) => {
  try {
    const { messageId } = req.params;
    await emailService.handleOpen(messageId, req.headers['user-agent'], req.ip);
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(pixel);
  } catch {
    res.status(200).end();
  }
};

const trackClick = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { url } = req.query;
    if (!url) return res.redirect('/');
    await emailService.handleClick(messageId, decodeURIComponent(url), req.headers['user-agent'], req.ip);
    res.redirect(decodeURIComponent(url));
  } catch {
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