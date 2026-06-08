const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const User = require('../models/client/User');
const AdminUser = require('../models/admin/AdminUser');

// User JWT Strategy
const userOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
};

passport.use(
  'user-jwt',
  new JwtStrategy(userOptions, async (payload, done) => {
    try {
      const user = await User.findById(payload.id).select('-password');
      if (!user) return done(null, false);
      if (!user.isActive) return done(null, false);
      return done(null, user);
    } catch (error) {
      return done(error, false);
    }
  })
);

// Admin JWT Strategy
const adminOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
};

passport.use(
  'admin-jwt',
  new JwtStrategy(adminOptions, async (payload, done) => {
    try {
      const admin = await AdminUser.findById(payload.id).select('-password');
      if (!admin) return done(null, false);
      if (!admin.isActive) return done(null, false);
      return done(null, admin);
    } catch (error) {
      return done(error, false);
    }
  })
);

// API Key Strategy (Custom)
const ApiKey = require('../models/client/ApiKey');

const apiKeyOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
};

passport.use(
  'api-key',
  new JwtStrategy(apiKeyOptions, async (payload, done) => {
    try {
      const apiKey = await ApiKey.findById(payload.id)
        .populate('organizationId')
        .populate('userId');
      
      if (!apiKey) return done(null, false);
      if (!apiKey.isActive) return done(null, false);
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        return done(null, false);
      }
      
      apiKey.lastUsed = new Date();
      await apiKey.save();
      
      return done(null, {
        apiKey,
        user: apiKey.userId,
        organization: apiKey.organizationId,
        scopes: apiKey.scopes,
      });
    } catch (error) {
      return done(error, false);
    }
  })
);

module.exports = passport;