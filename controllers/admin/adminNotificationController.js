const axios = require('axios');
const User = require('../../models/client/User');
const Organization = require('../../models/client/Organization');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const getEmailStats = async (req, res, next) => {
  try {
    const BREVO_KEYS = [
      process.env.BREVO_API_KEY,
      process.env.BREVO_API_KEY_2,
      process.env.BREVO_API_KEY_3,
    ].filter(Boolean);

    const accounts = await Promise.all(
      BREVO_KEYS.map(async (key, i) => {
        try {
          const response = await axios.get('https://api.brevo.com/v3/smtp/statistics/aggregated', {
            headers: { 'api-key': key },
            params: { days: 1 },
          });

          return {
            account: 'Account ' + (i + 1),
            keyPrefix: key.substring(0, 10) + '...',
            isActive: true,
            delivered: response.data?.delivered || 0,
            sent: response.data?.sent || 0,
            hardBounces: response.data?.hardBounces || 0,
            softBounces: response.data?.softBounces || 0,
          };
        } catch (error) {
          return {
            account: 'Account ' + (i + 1),
            keyPrefix: key.substring(0, 10) + '...',
            isActive: false,
            error: error.response?.data?.message || error.message,
          };
        }
      })
    );

    const totalSent = accounts.reduce((sum, a) => sum + (a.sent || 0), 0);
    const totalDelivered = accounts.reduce((sum, a) => sum + (a.delivered || 0), 0);
    const totalUsers = await User.countDocuments({ isActive: true, isEmailVerified: true });
    const dailyLimit = BREVO_KEYS.length * 300;
    const usagePercent = dailyLimit > 0 ? Math.round((totalSent / dailyLimit) * 100) : 0;

    res.status(200).json({
      success: true,
      stats: {
        accounts,
        accountsCount: BREVO_KEYS.length,
        dailyLimit,
        sentToday: totalSent,
        deliveredToday: totalDelivered,
        remaining: Math.max(0, dailyLimit - totalSent),
        usagePercent,
        totalReachableUsers: totalUsers,
      },
    });
  } catch (error) { next(error); }
};

const getOrgActivity = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 4;
    
    const organizations = await Organization.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const orgsWithUsers = await Promise.all(organizations.map(async (org) => {
      const userCount = await User.countDocuments({ organizationId: org._id });
      const owner = await User.findOne({ organizationId: org._id, role: 'owner' })
        .select('firstName lastName email createdAt')
        .lean();
      return {
        _id: org._id,
        name: org.name,
        email: org.email,
        createdAt: org.createdAt,
        userCount,
        owner: owner ? {
          name: owner.firstName + ' ' + owner.lastName,
          email: owner.email,
          joined: owner.createdAt,
        } : null,
      };
    }));

    res.status(200).json({ success: true, organizations: orgsWithUsers });
  } catch (error) { next(error); }
};

const sendToUser = async (req, res, next) => {
  try {
    const { userId, subject, message, fromName } = req.body;
    
    if (!userId || !subject || !message) {
      return next(new AppError('userId, subject, and message are required', 400, 'VALIDATION_001'));
    }

    const user = await User.findById(userId).select('email firstName lastName organizationId');
    if (!user) return next(new AppError('User not found', 404, 'NOT_FOUND'));

    const queueService = require('../../services/queueService');
    await queueService.addToQueue({
      organizationId: user.organizationId,
      userId: user._id,
      messageId: 'admin_msg_' + Date.now() + '_' + Math.random().toString(36).substring(7),
      from: process.env.SMTP_FROM_EMAIL || 'noreply@hdmbridge.com',
      fromName: fromName || 'HDM BRIDGE Admin',
      to: user.email,
      subject: subject,
      htmlBody: message,
      textBody: message.replace(/<[^>]*>/g, ''),
      priority: 'high',
    }, 'high');

    logger.info('Admin sent message to: ' + user.email);
    res.status(200).json({ success: true, message: 'Message sent to ' + user.email });
  } catch (error) { next(error); }
};

const sendToAllUsers = async (req, res, next) => {
  try {
    const { subject, message, fromName } = req.body;
    
    if (!subject || !message) {
      return next(new AppError('subject and message are required', 400, 'VALIDATION_001'));
    }

    const users = await User.find({ isActive: true, isEmailVerified: true }).select('email firstName lastName organizationId');
    
    if (users.length === 0) {
      return next(new AppError('No active verified users found', 404, 'NOT_FOUND'));
    }

    const queueService = require('../../services/queueService');
    let queued = 0;

    for (const user of users) {
      await queueService.addToQueue({
        organizationId: user.organizationId,
        userId: user._id,
        messageId: 'admin_bulk_' + Date.now() + '_' + queued,
        from: process.env.SMTP_FROM_EMAIL || 'noreply@hdmbridge.com',
        fromName: fromName || 'HDM BRIDGE Admin',
        to: user.email,
        subject: subject,
        htmlBody: message,
        textBody: message.replace(/<[^>]*>/g, ''),
        priority: 'normal',
      }, 'normal');
      queued++;
    }

    logger.info('Admin sent bulk message to ' + queued + ' users');
    res.status(200).json({ success: true, message: 'Message queued for ' + queued + ' users', queued: queued });
  } catch (error) { next(error); }
};

module.exports = { getEmailStats, getOrgActivity, sendToUser, sendToAllUsers };