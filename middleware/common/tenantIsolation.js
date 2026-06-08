const tenantIsolation = (req, res, next) => {
  if (!req.organizationId) {
    return res.status(403).json({
      success: false,
      error: 'Organization context required',
      code: 'TENANT_001',
    });
  }

  // Attach organization filter to request for automatic query scoping
  req.tenantFilter = { organizationId: req.organizationId };
  next();
};

module.exports = tenantIsolation;