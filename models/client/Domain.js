const mongoose = require('mongoose');

const domainSchema = new mongoose.Schema(
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
    domain: {
      type: String,
      required: [true, 'Domain is required'],
      lowercase: true,
      trim: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'in_progress', 'verified', 'failed'],
      default: 'pending',
    },
    dnsRecords: {
      spf: {
        exists: Boolean,
        value: String,
        verified: Boolean,
        verifiedAt: Date,
      },
      dkim: {
        exists: Boolean,
        value: String,
        selector: { type: String, default: 'hdm' },
        publicKey: String,
        privateKey: String,
        verified: Boolean,
        verifiedAt: Date,
      },
      dmarc: {
        exists: Boolean,
        value: String,
        verified: Boolean,
        verifiedAt: Date,
      },
      returnPath: {
        exists: Boolean,
        value: String,
        verified: Boolean,
      },
    },
    tracking: {
      enabled: { type: Boolean, default: true },
      customTrackingDomain: String,
      trackingVerified: Boolean,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    verificationRetries: {
      type: Number,
      default: 0,
    },
    lastVerifiedAt: Date,
  },
  {
    timestamps: true,
  }
);

domainSchema.index({ organizationId: 1, domain: 1 }, { unique: true });
domainSchema.index({ isVerified: 1 });

module.exports = mongoose.model('Domain', domainSchema);