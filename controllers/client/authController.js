const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../../models/client/User');
const Organization = require('../../models/client/Organization');
const Subscription = require('../../models/client/Subscription');
const Plan = require('../../models/client/Plan');
const EmailValidator = require('../../utils/emailValidator');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const register = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, organizationName } = req.body;

    const emailValidation = await EmailValidator.validate(email, true);
    if (!emailValidation.valid) return next(new AppError(emailValidation.errors[0], 400, 'VALIDATION_001'));

    const existingUser = await User.findOne({ email: emailValidation.normalized });
    if (existingUser) return next(new AppError('Email already registered', 409, 'CONFLICT_001'));

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
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
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
    });

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyHash = crypto.createHash('sha256').update(verifyToken).digest('hex');
    user.emailVerificationToken = verifyHash;
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const verifyUrl = (process.env.CLIENT_URL || 'http://localhost:3000') + '/verify-email/' + verifyToken;
    const htmlBody = '<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;"><div style="background:#4F46E5;padding:30px;text-align:center;border-radius:12px 12px 0 0;"><h1 style="color:white;margin:0;">✅ Verify Your Email</h1><p style="color:#C7D2FE;margin-top:8px;">Welcome to HDM BRIDGE</p></div><div style="background:white;padding:30px;border:1px solid #E5E7EB;border-top:none;text-align:center;"><h2 style="color:#1F2937;">Hi ' + firstName + '!</h2><p style="color:#4B5563;line-height:1.6;">Thanks for signing up. Please verify your email address to activate your account.</p><a href="' + verifyUrl + '" style="display:inline-block;background:#4F46E5;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;margin:20px 0;font-weight:600;font-size:16px;">Verify Email Address</a><p style="color:#9CA3AF;font-size:12px;">This link expires in 24 hours.</p></div><div style="background:#F9FAFB;padding:20px;text-align:center;border-radius:0 0 12px 12px;border:1px solid #E5E7EB;border-top:none;"><p style="color:#9CA3AF;font-size:12px;margin:0;">© 2026 HDM BRIDGE. All rights reserved.</p></div></div>';
    const textBody = 'Hi ' + firstName + '! Thanks for signing up. Verify your email: ' + verifyUrl;

    const queueService = require('../../services/queueService');
    await queueService.addToQueue({
      organizationId: organization._id,
      userId: user._id,
      messageId: 'verify_' + Date.now() + '_' + Math.random().toString(36).substring(7),
      from: process.env.SMTP_FROM_EMAIL || 'noreply@hdmbridge.com',
      fromName: 'HDM BRIDGE',
      to: user.email,
      subject: 'Verify your email - HDM BRIDGE',
      htmlBody: htmlBody,
      textBody: textBody,
      priority: 'high',
    }, 'high');

    logger.info('New user registered: ' + user.email);

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
    const token = jwt.sign({ id: user._id, organizationId: user.organizationId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });
    user.lastLogin = new Date(); user.lastLoginIP = req.ip;
    await user.save({ validateBeforeSave: false });
    logger.info('User logged in: ' + user.email);
    res.status(200).json({ success: true, token, user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role, organizationId: user.organizationId, isEmailVerified: user.isEmailVerified } });
  } catch (error) { next(error); }
};

const getMe = async (req, res) => { try { const user = await User.findById(req.user._id).populate('organizationId'); res.status(200).json({ success: true, user }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } };
const updateProfile = async (req, res, next) => { try { const { firstName, lastName, phone, timezone, preferredCurrency } = req.body; const user = await User.findByIdAndUpdate(req.user._id, { firstName, lastName, phone, timezone, preferredCurrency }, { new: true, runValidators: true }); res.status(200).json({ success: true, user }); } catch (error) { next(error); } };
const changePassword = async (req, res, next) => { try { const { currentPassword, newPassword } = req.body; const user = await User.findById(req.user._id).select('+password'); const isMatch = await user.comparePassword(currentPassword); if (!isMatch) return next(new AppError('Current password is incorrect', 401, 'AUTH_001')); user.password = newPassword; await user.save(); res.status(200).json({ success: true, message: 'Password updated' }); } catch (error) { next(error); } };
const forgotPassword = async (req, res) => { try { const { email } = req.body; const user = await User.findOne({ email: email.toLowerCase() }); if (!user) return res.status(200).json({ success: true, message: 'If the email exists, a reset link will be sent' }); const resetToken = crypto.randomBytes(32).toString('hex'); const resetHash = crypto.createHash('sha256').update(resetToken).digest('hex'); user.passwordResetToken = resetHash; user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); await user.save({ validateBeforeSave: false }); res.status(200).json({ success: true, message: 'If the email exists, a reset link will be sent' }); } catch (error) { res.status(500).json({ success: false, error: error.message }); } };
const resetPassword = async (req, res, next) => { try { const { token } = req.params; const { password } = req.body; const resetHash = crypto.createHash('sha256').update(token).digest('hex'); const user = await User.findOne({ passwordResetToken: resetHash, passwordResetExpires: { $gt: new Date() } }); if (!user) return next(new AppError('Invalid or expired reset token', 400, 'AUTH_001')); user.password = password; user.passwordResetToken = undefined; user.passwordResetExpires = undefined; await user.save(); res.status(200).json({ success: true, message: 'Password reset successful' }); } catch (error) { next(error); } };
const logout = async (req, res) => { res.status(200).json({ success: true, message: 'Logged out successfully' }); };
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
    logger.info('Email verified: ' + user.email);
    res.status(200).json({ success: true, message: 'Email verified successfully' });
  } catch (error) { next(error); }
};

module.exports = { register, login, getMe, updateProfile, changePassword, forgotPassword, resetPassword, logout, verifyEmail };