const AdminAuditLog = require('../../models/admin/AdminAuditLog');

const auditLog = (action, resourceType) => {
  return async (req, res, next) => {
    const originalJson = res.json;

    res.json = function (data) {
      res.locals.responseData = data;
      return originalJson.call(this, data);
    };

    res.on('finish', async () => {
      try {
        await AdminAuditLog.create({
          adminId: req.admin?._id,
          action,
          resourceType,
          resourceId: req.params.id || req.body?.id,
          details: {
            method: req.method,
            endpoint: req.originalUrl,
            requestBody: sanitizeBody(req.body),
            responseStatus: res.statusCode,
            ip: req.ip,
          },
          organizationId: req.organizationId || null,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error('Audit log error:', error.message);
      }
    });

    next();
  };
};

function sanitizeBody(body) {
  if (!body) return {};
  const sanitized = { ...body };
  delete sanitized.password;
  delete sanitized.token;
  delete sanitized.apiKey;
  delete sanitized.secret;
  return sanitized;
}

module.exports = { auditLog };