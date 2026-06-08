const mongoose = require('mongoose');

const adminPermissionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    description: String,
    group: {
      type: String,
      required: true,
      enum: [
        'users',
        'payments',
        'plans',
        'currency',
        'system',
        'legal',
        'analytics',
        'ai_widget',
        'backup',
        'admins',
        'audit',
      ],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('AdminPermission', adminPermissionSchema);