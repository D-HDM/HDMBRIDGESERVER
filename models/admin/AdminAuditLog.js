const mongoose = require('mongoose');

const adminAuditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      required: true,
      enum: [
        'user',
        'users',
        'organization',
        'payment',
        'payment_method',
        'plan',
        'currency',
        'system',
        'legal',
        'analytics',
        'ai_widget',
        'backup',
        'admin',
        'role',
        'subscription',
      ],
    },
    resourceId: String,
    details: {
      type: mongoose.Schema.Types.Mixed,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
    },
    ip: String,
    userAgent: String,
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

adminAuditLogSchema.index({ adminId: 1, timestamp: -1 });
adminAuditLogSchema.index({ action: 1, timestamp: -1 });
adminAuditLogSchema.index({ resourceType: 1 });

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);