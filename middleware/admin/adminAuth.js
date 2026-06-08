const jwt = require('jsonwebtoken');
const AdminUser = require('../../models/admin/AdminUser');
const { AppError } = require('../common/errorHandler');

const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Admin authentication required', 401, 'AUTH_001'));
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await AdminUser.findById(decoded.id)
      .select('-password')
      .populate('role');

    if (!admin) {
      return next(new AppError('Admin not found', 401, 'AUTH_001'));
    }

    if (!admin.isActive) {
      return next(new AppError('Admin account deactivated', 403, 'AUTH_002'));
    }

    req.admin = admin;
    req.adminRole = admin.role;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new AppError('Invalid or expired token', 401, 'AUTH_001'));
    }
    next(error);
  }
};

const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin || !req.adminRole) {
      return next(new AppError('Access denied', 403, 'AUTH_003'));
    }

    // Super admin has all permissions
    if (req.adminRole.name === 'Super Admin') {
      return next();
    }

    if (!req.adminRole.permissions.includes(permission)) {
      return next(new AppError('Insufficient permissions', 403, 'AUTH_003'));
    }

    next();
  };
};

module.exports = { adminAuth, checkPermission };