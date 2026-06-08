const mongoose = require('mongoose');

const adminRoleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: String,
    permissions: [
      {
        type: String,
        enum: [
          'users.view',
          'users.create',
          'users.edit',
          'users.delete',
          'users.suspend',
          'payments.view',
          'payments.refund',
          'payments.manual',
          'plans.view',
          'plans.create',
          'plans.edit',
          'plans.delete',
          'currency.view',
          'currency.edit',
          'system.view',
          'system.edit',
          'legal.view',
          'legal.edit',
          'analytics.view',
          'analytics.export',
          'ai_widget.view',
          'ai_widget.edit',
          'backup.view',
          'backup.create',
          'backup.restore',
          'backup.delete',
          'admins.view',
          'admins.create',
          'admins.edit',
          'admins.delete',
          'audit.view',
          'audit.export',
        ],
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('AdminRole', adminRoleSchema);