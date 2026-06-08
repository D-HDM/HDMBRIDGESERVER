const mongoose = require('mongoose');

const legalDocumentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['terms_of_service', 'privacy_policy', 'cookie_policy', 'gdpr', 'custom'],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    publishedAt: Date,
    effectiveDate: Date,
    requiresAcceptance: {
      type: Boolean,
      default: true,
    },
    forceReAcceptance: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    },
    changeLog: String,
  },
  {
    timestamps: true,
  }
);

legalDocumentSchema.index({ type: 1, isPublished: 1 });
legalDocumentSchema.index({ type: 1, version: -1 });

module.exports = mongoose.model('LegalDocument', legalDocumentSchema);