const jwt = require('jsonwebtoken');
const User = require('../../models/client/User');

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_001' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided', code: 'AUTH_001' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password').populate('organizationId');

    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found', code: 'AUTH_001' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, error: 'Account suspended', code: 'AUTH_002' });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({ success: false, error: 'Email not verified. Please check your inbox.', code: 'AUTH_003' });
    }

    req.user = user;
    req.organizationId = user.organizationId?._id || user.organizationId;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: 'Invalid token', code: 'AUTH_001' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired', code: 'AUTH_001' });
    }
    next(error);
  }
};

module.exports = auth;