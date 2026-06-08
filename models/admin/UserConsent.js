const mongoose = require('mongoose');

const userConsentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LegalDocument',
      required: true,
    },
    documentType: String,
    documentVersion: Number,
    accepted: {
      type: Boolean,
      default: false,
    },
    acceptedAt: Date,
    ipAddress: String,
    userAgent: String,
  },
  {
    timestamps: true,
  }
);

userConsentSchema.index({ userId: 1, documentId: 1 });
userConsentSchema.index({ organizationId: 1 });

module.exports = mongoose.model('UserConsent', userConsentSchema);