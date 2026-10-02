const PaymentMethod = require('../models/admin/PaymentMethod');
const { toAdminShape } = require('../utils/paymentMethodAdapter');
const logger = require('../utils/logger');

function substitute(template, vars) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

function buildVars({ amount, currency, invoiceNumber }) {
  const amountStr = Number(amount || 0).toLocaleString('en-US');
  return { invoice_number: invoiceNumber, invoiceNumber, amount: amountStr, currency };
}

function buildInstructions(method, { amount, currency, invoiceNumber }) {
  const c = method.config || {};
  const vars = buildVars({ amount, currency, invoiceNumber });

  switch (method.code) {
    case 'stripe':
      return {
        code: 'stripe',
        mode: 'auto',
        title: 'Card (Stripe)',
        description: 'Pay securely with your credit or debit card.',
        action: { type: 'stripe', label: 'Pay with Card' },
      };

    case 'mpesa_stk':
      return {
        code: 'mpesa_stk',
        mode: 'auto',
        title: 'M-Pesa STK Push',
        description: "Enter your M-Pesa phone number and we'll send a payment prompt.",
        action: { type: 'stk', label: 'Send STK to my phone' },
      };

    case 'mpesa_send':
      return {
        code: 'mpesa_send',
        mode: 'manual',
        title: 'M-Pesa Send Money',
        description: 'Send money directly to our number.',
        steps: [
          'Go to M-Pesa menu',
          'Select "Send Money"',
          'Enter number: ' + (c.phone || '[not configured]'),
          'Enter amount: ' + currency + ' ' + vars.amount,
          'Enter your PIN and confirm',
          'Save the M-Pesa confirmation code',
        ],
        recipient: { phone: c.phone || null, name: c.name || null },
      };

    case 'mpesa_till':
      return {
        code: 'mpesa_till',
        mode: 'manual',
        title: 'M-Pesa Buy Goods (Till)',
        description: 'Pay via our Buy Goods till number.',
        steps: [
          'Go to M-Pesa menu',
          'Select "Lipa na M-Pesa"',
          'Select "Buy Goods and Services"',
          'Enter till number: ' + (c.tillNumber || '[not configured]'),
          'Enter amount: ' + currency + ' ' + vars.amount,
          'Enter your PIN and confirm',
        ],
        recipient: { tillNumber: c.tillNumber || null, name: c.name || null },
      };

    case 'mpesa_paybill': {
      const accountNumber = substitute(c.accountNumber || invoiceNumber, vars);
      return {
        code: 'mpesa_paybill',
        mode: 'manual',
        title: 'M-Pesa Paybill',
        description: 'Pay via our Paybill number.',
        steps: [
          'Go to M-Pesa menu',
          'Select "Lipa na M-Pesa"',
          'Select "Pay Bill"',
          'Enter business number: ' + (c.paybillNumber || '[not configured]'),
          'Enter account number: ' + accountNumber,
          'Enter amount: ' + currency + ' ' + vars.amount,
          'Enter your PIN and confirm',
        ],
        recipient: { paybillNumber: c.paybillNumber || null, accountNumber, name: c.name || null },
      };
    }

    case 'bank':
      return {
        code: 'bank',
        mode: 'manual',
        title: 'Bank Transfer',
        description: 'Transfer to our bank account.',
        steps: [
          'Bank: ' + (c.bankName || '[not configured]'),
          'Account name: ' + (c.accountName || '[not configured]'),
          'Account number: ' + (c.accountNumber || '[not configured]'),
          c.branch ? 'Branch: ' + c.branch : null,
          c.swift ? 'SWIFT: ' + c.swift : null,
          'Amount: ' + currency + ' ' + vars.amount,
          'Reference: ' + invoiceNumber,
        ].filter(Boolean),
        recipient: {
          bankName: c.bankName || null,
          accountName: c.accountName || null,
          accountNumber: c.accountNumber || null,
          branch: c.branch || null,
          swift: c.swift || null,
        },
      };

    default:
      return null;
  }
}

async function getPaymentInstructions({ amount, currency, invoiceNumber }) {
  try {
    const docs = await PaymentMethod.find().sort('sortOrder');
    const flat = docs.flatMap(toAdminShape).filter((m) => m.enabled);

    const out = [];
    for (const m of flat) {
      const built = buildInstructions(m, { amount, currency, invoiceNumber });
      if (built) out.push(built);
    }
    return out;
  } catch (err) {
    logger.error('getPaymentInstructions failed: ' + err.message);
    return [];
  }
}

module.exports = { getPaymentInstructions };