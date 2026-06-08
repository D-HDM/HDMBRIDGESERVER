const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const AdminUser = require('../../models/admin/AdminUser');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

// @desc    Admin login
// @route   POST /admin/api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new AppError('Email and password are required', 400, 'VALIDATION_001'));
    }

    const admin = await AdminUser.findOne({ email: email.toLowerCase() }).select('+password');
    if (!admin) {
      return next(new AppError('Invalid credentials', 401, 'AUTH_001'));
    }

    if (!admin.isActive) {
      return next(new AppError('Account deactivated. Contact super admin.', 403, 'AUTH_002'));
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return next(new AppError('Invalid credentials', 401, 'AUTH_001'));
    }

    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    admin.lastLogin = new Date();
    admin.lastLoginIP = req.ip;
    await admin.save({ validateBeforeSave: false });

    logger.info(`Admin logged in: ${admin.email}`);

    res.status(200).json({
      success: true,
      token,
      admin: {
        id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        role: admin.role,
        isSuperAdmin: admin.isSuperAdmin,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current admin
// @route   GET /admin/api/auth/me
// @access  Private (Admin)
const getMe = async (req, res, next) => {
  try {
    const admin = await AdminUser.findById(req.admin._id).populate('role');

    res.status(200).json({
      success: true,
      admin: {
        id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        role: admin.role,
        isSuperAdmin: admin.isSuperAdmin,
        lastLogin: admin.lastLogin,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin logout
// @route   POST /admin/api/auth/logout
// @access  Private (Admin)
const logout = async (req, res, next) => {
  try {
    logger.info(`Admin logged out: ${req.admin.email}`);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Forgot password
// @route   POST /admin/api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const admin = await AdminUser.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(200).json({
        success: true,
        message: 'If the email exists, a reset link will be sent',
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    admin.passwordResetToken = resetHash;
    admin.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await admin.save({ validateBeforeSave: false });

    logger.info(`Password reset requested for admin: ${admin.email}`);

    res.status(200).json({
      success: true,
      message: 'If the email exists, a reset link will be sent',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password
// @route   POST /admin/api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const resetHash = crypto.createHash('sha256').update(token).digest('hex');

    const admin = await AdminUser.findOne({
      passwordResetToken: resetHash,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!admin) {
      return next(new AppError('Invalid or expired reset token', 400, 'AUTH_001'));
    }

    admin.password = password;
    admin.passwordResetToken = undefined;
    admin.passwordResetExpires = undefined;
    await admin.save();

    logger.info(`Password reset completed for admin: ${admin.email}`);

    res.status(200).json({
      success: true,
      message: 'Password reset successful',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  getMe,
  logout,
  forgotPassword,
  resetPassword,
};