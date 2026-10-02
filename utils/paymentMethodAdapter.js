const LABELS = {
  stripe: 'Stripe',
  paypal: 'PayPal',
  mpesa_stk: 'M-Pesa STK',
  mpesa_send: 'M-Pesa Send',
  mpesa_till: 'M-Pesa Till',
  mpesa_paybill: 'M-Pesa Paybill',
  bank: 'Bank Transfer',
};

const ENV_SOURCED = ['stripe', 'mpesa_stk'];

function mask(value) {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return value.substring(0, 4) + '••••••••' + value.slice(-4);
}

function toAdminShape(doc) {
  const mode = doc.mode || 'manual';

  switch (doc.type) {
    case 'stripe':
      return [{
        _id: 'stripe',
        label: doc.displayName || LABELS.stripe,
        code: 'stripe',
        mode,
        enabled: !!doc.isEnabled,
        envSourced: true,
        config: {
          mode: process.env.STRIPE_MODE || 'test',
          publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
          secretKey: mask(process.env.STRIPE_SECRET_KEY),
          webhookSecret: mask(process.env.STRIPE_WEBHOOK_SECRET),
        },
      }];

    case 'paypal':
      return [{
        _id: 'paypal',
        label: doc.displayName || LABELS.paypal,
        code: 'paypal',
        mode,
        enabled: !!doc.isEnabled,
        envSourced: true,
        config: {},
      }];

    case 'bank_transfer':
      return [{
        _id: 'bank',
        label: doc.displayName || LABELS.bank,
        code: 'bank',
        mode,
        enabled: !!doc.isEnabled,
        envSourced: false,
        config: {
          bankName: doc.configuration?.bankName || '',
          accountName: doc.configuration?.accountName || '',
          accountNumber: doc.configuration?.accountNumber || '',
          branch: doc.configuration?.branchName || '',
          swift: doc.configuration?.swiftCode || '',
        },
      }];

    case 'mpesa': {
      const c = doc.configuration || {};
      return [
        {
          _id: 'mpesa_stk',
          label: LABELS.mpesa_stk,
          code: 'mpesa_stk',
          mode: c.stkPush?.enabled ? 'auto' : mode,
          enabled: !!c.stkPush?.enabled,
          envSourced: true,
          config: {
            env: process.env.MPESA_ENVIRONMENT || 'sandbox',
            consumerKey: mask(process.env.MPESA_CONSUMER_KEY),
            consumerSecret: mask(process.env.MPESA_CONSUMER_SECRET),
            shortcode: process.env.MPESA_SHORTCODE || '',
            passkey: mask(process.env.MPESA_PASSKEY),
            callbackUrl: process.env.MPESA_CALLBACK_URL || '',
          },
        },
        {
          _id: 'mpesa_send',
          label: LABELS.mpesa_send,
          code: 'mpesa_send',
          mode,
          enabled: !!c.sendMoney?.enabled,
          envSourced: false,
          config: {
            phone: c.sendMoney?.phoneNumber || '',
            name: c.sendMoney?.name || '',
          },
        },
        {
          _id: 'mpesa_till',
          label: LABELS.mpesa_till,
          code: 'mpesa_till',
          mode,
          enabled: !!c.till?.enabled,
          envSourced: false,
          config: {
            tillNumber: c.till?.tillNumber || '',
            name: c.till?.name || '',
          },
        },
        {
          _id: 'mpesa_paybill',
          label: LABELS.mpesa_paybill,
          code: 'mpesa_paybill',
          mode,
          enabled: !!c.paybill?.enabled,
          envSourced: false,
          config: {
            paybillNumber: c.paybill?.paybillNumber || '',
            accountNumber: c.paybill?.accountNumber || '',
            name: c.paybill?.name || '',
          },
        },
      ];
    }

    default:
      return [];
  }
}

function resolveCompositeId(code) {
  switch (code) {
    case 'stripe':        return { parentType: 'stripe',        subKey: null };
    case 'paypal':        return { parentType: 'paypal',        subKey: null };
    case 'bank':          return { parentType: 'bank_transfer', subKey: null };
    case 'mpesa_stk':     return { parentType: 'mpesa',         subKey: 'stkPush' };
    case 'mpesa_send':    return { parentType: 'mpesa',         subKey: 'sendMoney' };
    case 'mpesa_till':    return { parentType: 'mpesa',         subKey: 'till' };
    case 'mpesa_paybill': return { parentType: 'mpesa',         subKey: 'paybill' };
    default:              return null;
  }
}

function fromAdminShape(code, patch) {
  const resolved = resolveCompositeId(code);
  if (!resolved) return null;

  const { parentType, subKey } = resolved;
  const set = {};

  if (typeof patch.enabled === 'boolean') {
    if (subKey) {
      set[`configuration.${subKey}.enabled`] = patch.enabled;
    } else {
      set.isEnabled = patch.enabled;
    }
  }

  if (typeof patch.label === 'string') {
    set.displayName = patch.label;
  }

  if (patch.mode === 'auto' || patch.mode === 'manual') {
    set.mode = patch.mode;
  }

  if (
    patch.config &&
    typeof patch.config === 'object' &&
    !ENV_SOURCED.includes(code)
  ) {
    const c = patch.config;

    if (parentType === 'bank_transfer') {
      if (c.bankName !== undefined)       set['configuration.bankName'] = c.bankName;
      if (c.accountName !== undefined)    set['configuration.accountName'] = c.accountName;
      if (c.accountNumber !== undefined)  set['configuration.accountNumber'] = c.accountNumber;
      if (c.branch !== undefined)         set['configuration.branchName'] = c.branch;
      if (c.swift !== undefined)          set['configuration.swiftCode'] = c.swift;
    }

    if (parentType === 'mpesa' && subKey && subKey !== 'stkPush') {
      const rename = (k) => (k === 'phone' ? 'phoneNumber' : k);
      for (const [k, v] of Object.entries(c)) {
        set[`configuration.${subKey}.${rename(k)}`] = v;
      }
    }
  }

  return set;
}

module.exports = {
  toAdminShape,
  fromAdminShape,
  resolveCompositeId,
  LABELS,
  ENV_SOURCED,
};