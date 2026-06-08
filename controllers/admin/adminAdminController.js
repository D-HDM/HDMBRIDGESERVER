const AdminUser = require('../../models/admin/AdminUser');
const AdminRole = require('../../models/admin/AdminRole');
const AdminAuditLog = require('../../models/admin/AdminAuditLog');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const getAdmins = async (req, res, next) => {
  try {
    const admins = await AdminUser.find().populate('role', 'name slug permissions');
    res.status(200).json({ success: true, admins });
  } catch (error) {
    next(error);
  }
};

const getAdminById = async (req, res, next) => {
  try {
    const admin = await AdminUser.findById(req.params.id).populate('role');
    if (!admin) {
      return next(new AppError('Admin not found', 404, 'NOT_FOUND'));
    }
    res.status(200).json({ success: true, admin });
  } catch (error) {
    next(error);
  }
};

const createAdmin = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;

    const existing = await AdminUser.findOne({ email: email.toLowerCase() });
    if (existing) {
      return next(new AppError('Admin with this email already exists', 409, 'CONFLICT_001'));
    }

    const admin = await AdminUser.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password,
      role,
    });

    logger.info('Admin created: ' + admin.email);

    res.status(201).json({
      success: true,
      admin: {
        id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

const updateAdmin = async (req, res, next) => {
  try {
    const { firstName, lastName, role, isActive, password } = req.body;
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (role) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) updateData.password = password;

    const admin = await AdminUser.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!admin) {
      return next(new AppError('Admin not found', 404, 'NOT_FOUND'));
    }

    logger.info('Admin updated: ' + admin.email);
    res.status(200).json({ success: true, admin });
  } catch (error) {
    next(error);
  }
};

const deleteAdmin = async (req, res, next) => {
  try {
    const admin = await AdminUser.findById(req.params.id);
    if (!admin) {
      return next(new AppError('Admin not found', 404, 'NOT_FOUND'));
    }
    if (admin.isSuperAdmin) {
      return next(new AppError('Cannot delete super admin', 400, 'VALIDATION_001'));
    }

    await AdminUser.findByIdAndDelete(req.params.id);
    logger.info('Admin deleted: ' + admin.email);
    res.status(200).json({ success: true, message: 'Admin deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const getRoles = async (req, res, next) => {
  try {
    const roles = await AdminRole.find();
    res.status(200).json({ success: true, roles });
  } catch (error) {
    next(error);
  }
};

const createRole = async (req, res, next) => {
  try {
    const { name, description, permissions } = req.body;
    const slug = name.toLowerCase().replace(/\s+/g, '_');
    const role = await AdminRole.create({ name, slug, description, permissions });
    logger.info('Admin role created: ' + role.name);
    res.status(201).json({ success: true, role });
  } catch (error) {
    next(error);
  }
};

const updateRole = async (req, res, next) => {
  try {
    const role = await AdminRole.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!role) {
      return next(new AppError('Role not found', 404, 'NOT_FOUND'));
    }
    logger.info('Admin role updated: ' + role.name);
    res.status(200).json({ success: true, role });
  } catch (error) {
    next(error);
  }
};

const getAuditLogs = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const { adminId, action, resourceType, startDate, endDate } = req.query;

    const filter = {};
    if (adminId) filter.adminId = adminId;
    if (action) filter.action = action;
    if (resourceType) filter.resourceType = resourceType;
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AdminAuditLog.find(filter)
        .populate('adminId', 'firstName lastName email')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit),
      AdminAuditLog.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdmins,
  getAdminById,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  getRoles,
  createRole,
  updateRole,
  getAuditLogs,
};