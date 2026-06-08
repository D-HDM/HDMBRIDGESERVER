const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    type: {
      type: String,
      enum: ['string', 'number', 'boolean', 'json', 'array'],
      default: 'string',
    },
    description: String,
    group: {
      type: String,
      enum: ['general', 'email', 'security', 'registration', 'notifications'],
      default: 'general',
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    isEditable: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

systemSettingSchema.index({ key: 1, group: 1 });

module.exports = mongoose.model('SystemSetting', systemSettingSchema);