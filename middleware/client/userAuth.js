const { AppError } = require('../common/errorHandler');

const checkRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'AUTH_001'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403, 'AUTH_003'));
    }

    next();
  };
};

const isOwnerOrAdmin = (model, paramIdField = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[paramIdField];
      const resource = await model.findById(resourceId);

      if (!resource) {
        return next(new AppError('Resource not found', 404, 'NOT_FOUND'));
      }

      const isOwner = resource.userId?.toString() === req.user._id.toString() ||
                      resource.organizationId?.toString() === req.organizationId.toString();
      const isAdmin = ['owner', 'admin'].includes(req.user.role);

      if (!isOwner && !isAdmin) {
        return next(new AppError('Access denied', 403, 'AUTH_003'));
      }

      req.resource = resource;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { checkRole, isOwnerOrAdmin };