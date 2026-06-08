const mongoose = require('mongoose');

const smsLogSchema = new mongoose.Schema(
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
    messageId: {
      type: String,
      required: true,
      unique: true,
    },
    to: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 160,
    },
    sender: {
      type: String,
      default: 'HDM BRIDGE',
    },
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed', 'delivered'],
      default: 'queued',
    },
    creditsUsed: {
      type: Number,
      default: 1,
    },
    brevoMessageId: String,
    error: String,
    type: {
      type: String,
      enum: ['transactional', 'marketing'],
      default: 'transactional',
    },
  },
  {
    timestamps: true,
  }
);

smsLogSchema.index({ organizationId: 1, createdAt: -1 });
smsLogSchema.index({ messageId: 1 });

module.exports = mongoose.model('SmsLog', smsLogSchema);