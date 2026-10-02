const AdminUser = require('../models/admin/AdminUser');
const emailService = require('./emailService');
const logger = require('../utils/logger');

const CACHE_TTL = 5 * 60 * 1000;
let cachedRecipients = null;
let cachedAt = 0;

async function getRecipients() {
  if (cachedRecipients && Date.now() - cachedAt < CACHE_TTL) {
    return cachedRecipients;
  }

  try {
    const admins = await AdminUser.find({ isActive: true })
      .select('email firstName lastName isSuperAdmin')
      .lean();

    const recipients = admins
      .filter((a) => a.email)
      .map((a) => ({ email: a.email, name: a.firstName || 'Admin' }));

    cachedRecipients = recipients;
    cachedAt = Date.now();
    return recipients;
  } catch (err) {
    logger.error('adminNotifier.getRecipients failed: ' + err.message);
    return [];
  }
}

function invalidateRecipientsCache() {
  cachedRecipients = null;
  cachedAt = 0;
}

async function notifyAdmins(templateKey, data, options = {}) {
  try {
    const recipients = await getRecipients();

    if (recipients.length === 0) {
      logger.warn('adminNotifier: no active admins for ' + templateKey);
      return { sent: 0 };
    }

    const priority = options.priority || 'normal';

    const results = await Promise.allSettled(
      recipients.map((r) =>
        emailService.send(
          r.email,
          templateKey,
          { ...data, adminName: r.name },
          {
            priority,
            organizationId: options.organizationId,
            userId: options.userId,
          }
        )
      )
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - sent;

    logger.info('adminNotifier: ' + templateKey + ' sent=' + sent + ' failed=' + failed);
    return { sent, failed };
  } catch (err) {
    logger.error('adminNotifier.notifyAdmins failed: ' + err.message);
    return { sent: 0, failed: 0, error: err.message };
  }
}

module.exports = { notifyAdmins, getRecipients, invalidateRecipientsCache };