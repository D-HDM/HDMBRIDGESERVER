const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema(
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
    },
    apiKeyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ApiKey',
    },
    messageId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Template',
    },
    from: {
      email: { type: String, required: true },
      name: String,
    },
    to: {
      email: { type: String, required: true },
      name: String,
    },
    replyTo: String,
    subject: { type: String, required: true },
    htmlBody: String,
    textBody: String,
    status: {
      type: String,
      enum: ['queued', 'processing', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'spam', 'deferred'],
      default: 'queued',
      index: true,
    },
    deliveryDetails: {
      smtpResponse: String,
      smtpMessageId: String,
      smtpServer: String,
      attempts: { type: Number, default: 0 },
      lastAttempt: Date,
      deliveredAt: Date,
    },
    tracking: {
      opened: { type: Boolean, default: false },
      openedAt: Date,
      openCount: { type: Number, default: 0 },
      openIP: String,
      openUserAgent: String,
      clicked: { type: Boolean, default: false },
      clickedAt: Date,
      clickCount: { type: Number, default: 0 },
      clickedUrl: String,
      clickIP: String,
      clickUserAgent: String,
    },
    bounce: {
      bounced: { type: Boolean, default: false },
      bounceType: { type: String, enum: ['hard', 'soft', 'none'], default: 'none' },
      bounceReason: String,
      bounceCode: String,
      bouncedAt: Date,
    },
    spam: {
      markedAsSpam: { type: Boolean, default: false },
      spamReportedAt: Date,
      spamReason: String,
    },
    attachments: [
      {
        filename: String,
        size: Number,
        mimeType: String,
        url: String,
      },
    ],
    size: Number,
    priority: {
      type: String,
      enum: ['low', 'normal', 'high'],
      default: 'normal',
    },
    tags: [String],
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
    ip: String,
    userAgent: String,
  },
  {
    timestamps: true,
  }
);

emailLogSchema.index({ organizationId: 1, createdAt: -1 });
emailLogSchema.index({ status: 1, createdAt: -1 });
emailLogSchema.index({ 'to.email': 1 });
emailLogSchema.index({ messageId: 1 });

module.exports = mongoose.model('EmailLog', emailLogSchema);