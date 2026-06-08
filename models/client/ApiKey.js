const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const apiKeySchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'API key name is required'],
      trim: true,
      maxlength: 100,
    },
    prefix: {
      type: String,
      required: true,
      index: true,
    },
    hash: {
      type: String,
      required: true,
      select: false,
    },
    scopes: {
      type: [String],
      default: ['send'],
      enum: ['send', 'read', 'write', 'admin'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    expiresAt: Date,
    lastUsed: Date,
    ipWhitelist: [String],
    domainRestrictions: [String],
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

apiKeySchema.methods.compareKey = async function (plainKey) {
  return bcrypt.compare(plainKey, this.hash);
};

apiKeySchema.index({ organizationId: 1, isActive: 1 });

module.exports = mongoose.model('ApiKey', apiKeySchema);