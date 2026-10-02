const User = require('../../models/client/User');
const Organization = require('../../models/client/Organization');
const EmailLog = require('../../models/client/EmailLog');
const emailService = require('../../services/emailService');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const getEmailStats = async (req, res, next) => {
  try {
    const BREVO_KEYS = [
      process.env.BREVO_API_KEY,
      process.env.BREVO_API_KEY_2,
      process.env.BREVO_API_KEY_3,
    ].filter(Boolean);

    const accounts = BREVO_KEYS.map((key, i) => ({
      account: 'Account ' + (i + 1),
      keyPrefix: key.substring(0, 10) + '...',
      isActive: true,
    }));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [todayCount, monthCount, totalUsers] = await Promise.all([
      EmailLog.countDocuments({
        createdAt: { $gte: today },
        status: { $in: ['sent', 'delivered', 'opened', 'clicked'] },
      }),
      EmailLog.countDocuments({
        createdAt: { $gte: thisMonth },
        status: { $in: ['sent', 'delivered', 'opened', 'clicked'] },
      }),
      User.countDocuments({ isActive: true, isEmailVerified: true }),
    ]);

    const dailyLimit = BREVO_KEYS.length * 300;
    const usagePercent = dailyLimit > 0 ? Math.round((todayCount / dailyLimit) * 100) : 0;

    res.status(200).json({
      success: true,
      stats: {
        accounts,
        accountsCount: BREVO_KEYS.length,
        dailyLimit,
        sentToday: todayCount,
        sentThisMonth: monthCount,
        remaining: Math.max(0, dailyLimit - todayCount),
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

    await emailService.send(user.email, 'broadcastToUser', {
      firstName: user.firstName,
      subject,
      messageHtml: message,
    }, {
      priority: 'high',
      source: 'broadcast',
      organizationId: user.organizationId,
      userId: user._id,
      fromName: fromName || 'HDM BRIDGE Admin',
    });

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

    const users = await User.find({ isActive: true, isEmailVerified: true })
      .select('email firstName lastName organizationId');

    if (users.length === 0) {
      return next(new AppError('No active verified users found', 404, 'NOT_FOUND'));
    }

    let queued = 0;
    const errors = [];

    for (const user of users) {
      try {
        await emailService.send(user.email, 'broadcastToAll', {
          firstName: user.firstName,
          subject,
          messageHtml: message,
        }, {
          priority: 'normal',
          source: 'broadcast',
          organizationId: user.organizationId,
          userId: user._id,
          fromName: fromName || 'HDM BRIDGE Admin',
        });
        queued++;
      } catch (err) {
        errors.push({ email: user.email, error: err.message });
      }
    }

    logger.info('Admin broadcast queued for ' + queued + ' users');

    res.status(200).json({
      success: true,
      message: 'Message queued for ' + queued + ' users',
      queued,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) { next(error); }
};

module.exports = { getEmailStats, getOrgActivity, sendToUser, sendToAllUsers };