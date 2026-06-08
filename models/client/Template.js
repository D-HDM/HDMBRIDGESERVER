const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema(
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
      required: [true, 'Template name is required'],
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      lowercase: true,
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      maxlength: 998,
    },
    htmlContent: {
      type: String,
      required: [true, 'HTML content is required'],
    },
    textContent: String,
    previewText: {
      type: String,
      maxlength: 150,
    },
    variables: [
      {
        name: String,
        defaultValue: String,
        required: { type: Boolean, default: false },
        description: String,
      },
    ],
    category: {
      type: String,
      enum: [
        'marketing',
        'transactional',
        'notification',
        'authentication',
        'newsletter',
        'other',
      ],
      default: 'other',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    thumbnail: String,
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

templateSchema.index({ organizationId: 1, category: 1 });
templateSchema.index({ organizationId: 1, isActive: 1 });

module.exports = mongoose.model('Template', templateSchema);