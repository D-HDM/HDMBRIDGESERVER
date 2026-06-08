const mongoose = require('mongoose');

const senderSchema = new mongoose.Schema(
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
    email: {
      type: String,
      required: [true, 'Sender email is required'],
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Sender name is required'],
      trim: true,
      maxlength: 100,
    },
    domainId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Domain',
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    verificationSentAt: Date,
    verifiedAt: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    replyTo: String,
    signature: String,
  },
  {
    timestamps: true,
  }
);

senderSchema.index({ organizationId: 1, email: 1 }, { unique: true });
senderSchema.index({ isVerified: 1 });

module.exports = mongoose.model('Sender', senderSchema);