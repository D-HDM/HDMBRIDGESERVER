const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
    planName: String,
    planInterval: { type: String, enum: ['month', 'year'], default: 'month' },
    type: { type: String, enum: ['subscription', 'upgrade', 'renewal'], default: 'subscription' },
    invoiceNumber: { type: String, unique: true, index: true },
    items: [{ name: String, description: String, qty: Number, unitPrice: Number, subtotal: Number }],
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    amountDue: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    status: {
      type: String,
      enum: ['sent', 'paid', 'expired', 'failed', 'cancelled'],
      default: 'sent',
      index: true,
    },
    paymentMethod: String,
    paymentRef: String,
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    confirmedAt: Date,
    issuedAt: { type: Date, default: Date.now },
    dueDate: { type: Date, index: true },
    paidAt: Date,
    paymentInstructions: [mongoose.Schema.Types.Mixed],
    customerSnapshot: { name: String, email: String, phone: String },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    notes: String,
  },
  { timestamps: true }
);

invoiceSchema.index({ organizationId: 1, createdAt: -1 });
invoiceSchema.index({ status: 1, dueDate: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);