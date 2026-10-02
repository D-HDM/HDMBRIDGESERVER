const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../../models/client/User');
const Organization = require('../../models/client/Organization');
const Subscription = require('../../models/client/Subscription');
const Plan = require('../../models/client/Plan');
const EmailValidator = require('../../utils/emailValidator');
const emailService = require('../../services/emailService');
const currencyService = require('../../services/currencyService');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const register = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, organizationName } = req.body;

    const emailValidation = await EmailValidator.validate(email, true);
    if (!emailValidation.valid) return next(new AppError(emailValidation.errors[0], 400, 'VALIDATION_001'));

    const existingUser = await User.findOne({ email: emailValidation.normalized });
    if (existingUser) return next(new AppError('Email already registered', 409, 'CONFLICT_001'));

    const preferredCurrency = await currencyService.getGlobalDefaultCode();

    const organization = await Organization.create({
      name: organizationName || firstName + "'s Organization",
      email: emailValidation.normalized,
    });

    const freePlan = await Plan.findOne({ tier: 'free' });
    if (freePlan) {
      await Subscription.create({
        organizationId: organization._id,
        planId: freePlan._id,
        status: 'active',
        paymentMethod: 'manual',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000),
        currentUsage: { monthlyEmails: 0, apiKeys: 0, domains: 0, templates: 0 },
      });
    }

    const user = await User.create({
      organizationId: organization._id,
      firstName,
      lastName,
      email: emailValidation.normalized,
      password,
      role: 'owner',
      preferredCurrency,
    });

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyHash = crypto.createHash('sha256').update(verifyToken).digest('hex');
    user.emailVerificationToken = verifyHash;
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const verifyUrl = (process.env.CLIENT_URL || 'http://localhost:3000') + '/verify-email/' + verifyToken;

    await emailService.send(email, 'verifyEmail', {
      firstName,
      verifyUrl,
      expiresHours: 24,
    }, {
      priority: 'high',
      source: 'system',
      organizationId: organization._id,
      userId: user._id,
    }).catch((err) => logger.error('Verification email failed: ' + err.message));

    logger.info('New user registered: ' + user.email + ' currency=' + preferredCurrency);

    res.status(201).json({
      success: true,
      message: 'Verification email sent. Please check your inbox to activate your account.',
      email: user.email,
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return next(new AppError('Email and password are required', 400, 'VALIDATION_001'));

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) return next(new AppError('Invalid credentials', 401, 'AUTH_001'));
    if (!user.isActive) return next(new AppError('Account suspended', 403, 'AUTH_002'));
    if (!user.isEmailVerified) return next(new AppError('Please verify your email before logging in', 403, 'AUTH_003'));

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return next(new AppError('Invalid credentials', 401, 'AUTH_001'));

    const token = jwt.sign(
      { id: user._id, organizationId: user.organizationId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    user.lastLogin = new Date();
    user.lastLoginIP = req.ip;
    await user.save({ validateBeforeSave: false });

    logger.info('User logged in: ' + user.email);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) { next(error); }
};

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('organizationId');
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { firstName, lastName, phone, timezone, preferredCurrency } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { firstName, lastName, phone, timezone, preferredCurrency },
      { new: true, runValidators: true }
    );
    res.status(200).json({ success: true, user });
  } catch (error) { next(error); }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return next(new AppError('Current password is incorrect', 401, 'AUTH_001'));
    user.password = newPassword;
    await user.save();
    res.status(200).json({ success: true, message: 'Password updated' });
  } catch (error) { next(error); }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(new AppError('Email is required', 400, 'VALIDATION_001'));

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If the email exists, a reset link will be sent',
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetToken = resetHash;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const resetUrl = (process.env.CLIENT_URL || 'http://localhost:3000') + '/reset-password/' + resetToken;

    await emailService.send(user.email, 'passwordReset', {
      firstName: user.firstName,
      resetUrl,
      expiresMinutes: 60,
    }, {
      priority: 'high',
      source: 'system',
      organizationId: user.organizationId,
      userId: user._id,
    }).catch((err) => logger.error('Password reset email failed: ' + err.message));

    res.status(200).json({
      success: true,
      message: 'If the email exists, a reset link will be sent',
    });
  } catch (error) { next(error); }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    if (!password) return next(new AppError('Password is required', 400, 'VALIDATION_001'));

    const resetHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: resetHash,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) return next(new AppError('Invalid or expired reset token', 400, 'AUTH_001'));

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    await emailService.send(user.email, 'passwordChanged', {
      firstName: user.firstName,
      at: new Date(),
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    }, {
      priority: 'high',
      source: 'system',
      organizationId: user.organizationId,
      userId: user._id,
    }).catch((err) => logger.error('Password changed email failed: ' + err.message));

    res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (error) { next(error); }
};

const logout = async (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out successfully' });
};

const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;
    const verifyHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      emailVerificationToken: verifyHash,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) return next(new AppError('Invalid or expired verification link', 400, 'AUTH_001'));

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    await emailService.send(user.email, 'welcome', {
      firstName: user.firstName,
      dashboardUrl: (process.env.CLIENT_URL || '') + '/dashboard',
    }, {
      source: 'system',
      organizationId: user.organizationId,
      userId: user._id,
    }).catch((err) => logger.error('Welcome email failed: ' + err.message));

    logger.info('Email verified: ' + user.email);
    res.status(200).json({ success: true, message: 'Email verified successfully' });
  } catch (error) { next(error); }
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  logout,
  verifyEmail,
};