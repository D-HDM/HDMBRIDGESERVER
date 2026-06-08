#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('../config/dnsSet');

const mongoose = require('mongoose');
const readline = require('readline');
const bcrypt = require('bcryptjs');
const connectDB = require('../config/database');

const Plan = require('../models/client/Plan');
const SupportedCurrency = require('../models/client/SupportedCurrency');
const ExchangeRate = require('../models/client/ExchangeRate');
const PaymentMethod = require('../models/admin/PaymentMethod');
const SystemSetting = require('../models/admin/SystemSetting');
const LegalDocument = require('../models/admin/LegalDocument');
const AIWidgetSetting = require('../models/admin/AIWidgetSetting');
const AdminRole = require('../models/admin/AdminRole');
const AdminUser = require('../models/admin/AdminUser');
const Backup = require('../models/admin/Backup');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function mainMenu() {
  console.clear();
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║        HDM BRIDGE - SEED CLI             ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  1. Seed All (Everything)                ║');
  console.log('║  2. Seed Settings                        ║');
  console.log('║  3. Seed Plans & Limits                  ║');
  console.log('║  4. Seed Payment Methods & Currencies    ║');
  console.log('║  5. Seed Legal Documents                 ║');
  console.log('║  6. Seed Admin Roles & Default Admin     ║');
  console.log('║  7. Seed AI Widget Settings              ║');
  console.log('║  8. Seed Backup Config                   ║');
  console.log('║  0. Exit                                 ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const choice = await question('Select option: ');

  switch (choice) {
    case '1': await seedAll(); break;
    case '2': await seedSettings(); break;
    case '3': await seedPlans(); break;
    case '4': await seedPaymentAndCurrencies(); break;
    case '5': await seedLegal(); break;
    case '6': await seedAdminRoles(); break;
    case '7': await seedAIWidget(); break;
    case '8': await seedBackup(); break;
    case '0':
      console.log('\n👋 Goodbye!\n');
      process.exit(0);
    default:
      console.log('\n❌ Invalid option');
      await question('\nPress Enter to continue...');
      await mainMenu();
  }
}

async function seedAll() {
  console.log('\n🌱 Seeding All...\n');
  await seedSettings();
  await seedPlans();
  await seedPaymentAndCurrencies();
  await seedLegal();
  await seedAdminRoles();
  await seedAIWidget();
  await seedBackup();
  console.log('\n✅ All seeding complete!\n');
  await question('Press Enter to continue...');
  await mainMenu();
}

async function seedSettings() {
  console.log('📝 Seeding System Settings...');
  
  const settings = [
    { key: 'app_name', value: 'HDM BRIDGE', type: 'string', group: 'general', description: 'Platform name' },
    { key: 'app_logo', value: '/logo.png', type: 'string', group: 'general', description: 'Logo URL' },
    { key: 'app_favicon', value: '/favicon.ico', type: 'string', group: 'general', description: 'Favicon URL' },
    { key: 'support_email', value: 'support@hdmbridge.com', type: 'string', group: 'general', description: 'Support email' },
    { key: 'contact_phone', value: '', type: 'string', group: 'general', description: 'Contact phone' },
    { key: 'registration_open', value: true, type: 'boolean', group: 'registration', description: 'Allow new registrations' },
    { key: 'email_verification_required', value: false, type: 'boolean', group: 'registration', description: 'Require email verification' },
    { key: 'maintenance_mode', value: false, type: 'boolean', group: 'general', description: 'Maintenance mode' },
    { key: 'default_language', value: 'en', type: 'string', group: 'general', description: 'Default language' },
    { key: 'default_timezone', value: 'UTC', type: 'string', group: 'general', description: 'Default timezone' },
    { key: 'max_attachment_size_mb', value: 10, type: 'number', group: 'email', description: 'Max attachment size' },
    { key: 'allowed_attachment_types', value: ['pdf', 'jpg', 'png', 'doc', 'docx', 'xlsx', 'csv'], type: 'json', group: 'email', description: 'Allowed attachment types' },
    { key: 'max_recipients_per_email', value: 50, type: 'number', group: 'email', description: 'Max recipients per email' },
    { key: 'enable_smtp_fallback', value: false, type: 'boolean', group: 'email', description: 'Enable SMTP fallback' },
  ];

  for (const setting of settings) {
    await SystemSetting.findOneAndUpdate(
      { key: setting.key },
      setting,
      { upsert: true, new: true }
    );
  }

  console.log(`  ✅ ${settings.length} settings seeded`);
}

async function seedPlans() {
  console.log('💳 Seeding Plans & Limits...');

  const plans = [
    {
      name: 'Free',
      slug: 'free',
      description: 'For individuals and small projects getting started',
      tier: 'free',
      isPublic: true,
      price: { amount: 0, currency: 'USD', interval: 'month' },
      trialPeriod: { enabled: false, days: 0 },
      limits: {
        monthlyEmails: 3000,
        dailyEmails: 100,
        hourlyEmails: 10,
        apiKeys: 2,
        domains: 1,
        senders: 2,
        templates: 5,
        teamMembers: 1,
        rateLimitPerMinute: 10,
        rateLimitPerHour: 100,
        logRetentionDays: 7,
        attachmentSizeMB: 10,
        maxRecipientsPerEmail: 50,
      },
      features: {
        apiAccess: true,
        smtpAccess: false,
        customDomain: false,
        templates: true,
        tracking: true,
        analytics: false,
        webhooks: false,
        teamManagement: false,
        prioritySupport: false,
        dedicatedIP: false,
        whiteLabel: false,
        customDKIM: false,
        exportData: false,
      },
      overageCharges: { enabled: false, pricePerThousand: 0, currency: 'USD' },
      metadata: { color: '#6B7280', icon: 'free', sortOrder: 1, isRecommended: false, badge: '' },
    },
    {
      name: 'Pro',
      slug: 'pro',
      description: 'For growing businesses with higher volume needs',
      tier: 'pro',
      isPublic: true,
      price: { amount: 19, currency: 'USD', interval: 'month' },
      trialPeriod: { enabled: true, days: 14 },
      limits: {
        monthlyEmails: 50000,
        dailyEmails: 2000,
        hourlyEmails: 100,
        apiKeys: 10,
        domains: 3,
        senders: 10,
        templates: 50,
        teamMembers: 3,
        rateLimitPerMinute: 100,
        rateLimitPerHour: 1000,
        logRetentionDays: 30,
        attachmentSizeMB: 25,
        maxRecipientsPerEmail: 200,
      },
      features: {
        apiAccess: true,
        smtpAccess: true,
        customDomain: true,
        templates: true,
        tracking: true,
        analytics: true,
        webhooks: true,
        teamManagement: false,
        prioritySupport: false,
        dedicatedIP: false,
        whiteLabel: false,
        customDKIM: true,
        exportData: true,
      },
      overageCharges: { enabled: true, pricePerThousand: 0.50, currency: 'USD' },
      metadata: { color: '#4F46E5', icon: 'pro', sortOrder: 2, isRecommended: true, badge: 'Popular' },
    },
    {
      name: 'Pro+',
      slug: 'pro-plus',
      description: 'For large teams and high-volume senders',
      tier: 'proplus',
      isPublic: true,
      price: { amount: 79, currency: 'USD', interval: 'month' },
      trialPeriod: { enabled: true, days: 14 },
      limits: {
        monthlyEmails: 500000,
        dailyEmails: 20000,
        hourlyEmails: 1000,
        apiKeys: 999,
        domains: 999,
        senders: 999,
        templates: 999,
        teamMembers: 10,
        rateLimitPerMinute: 500,
        rateLimitPerHour: 5000,
        logRetentionDays: 90,
        attachmentSizeMB: 50,
        maxRecipientsPerEmail: 1000,
      },
      features: {
        apiAccess: true,
        smtpAccess: true,
        customDomain: true,
        templates: true,
        tracking: true,
        analytics: true,
        webhooks: true,
        teamManagement: true,
        prioritySupport: true,
        dedicatedIP: false,
        whiteLabel: true,
        customDKIM: true,
        exportData: true,
      },
      overageCharges: { enabled: true, pricePerThousand: 0.30, currency: 'USD' },
      metadata: { color: '#7C3AED', icon: 'pro-plus', sortOrder: 3, isRecommended: false, badge: 'Best Value' },
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      description: 'Custom solutions for large organizations',
      tier: 'enterprise',
      isPublic: false,
      price: { amount: 0, currency: 'USD', interval: 'month' },
      trialPeriod: { enabled: false, days: 0 },
      limits: {
        monthlyEmails: 9999999,
        dailyEmails: 999999,
        hourlyEmails: 99999,
        apiKeys: 9999,
        domains: 9999,
        senders: 9999,
        templates: 9999,
        teamMembers: 999,
        rateLimitPerMinute: 9999,
        rateLimitPerHour: 99999,
        logRetentionDays: 365,
        attachmentSizeMB: 100,
        maxRecipientsPerEmail: 10000,
      },
      features: {
        apiAccess: true,
        smtpAccess: true,
        customDomain: true,
        templates: true,
        tracking: true,
        analytics: true,
        webhooks: true,
        teamManagement: true,
        prioritySupport: true,
        dedicatedIP: true,
        whiteLabel: true,
        customDKIM: true,
        exportData: true,
      },
      overageCharges: { enabled: false, pricePerThousand: 0, currency: 'USD' },
      metadata: { color: '#1F2937', icon: 'enterprise', sortOrder: 4, isRecommended: false, badge: 'Custom' },
    },
  ];

  for (const plan of plans) {
    await Plan.findOneAndUpdate(
      { slug: plan.slug },
      plan,
      { upsert: true, new: true }
    );
  }

  console.log(`  ✅ ${plans.length} plans seeded`);
}

async function seedPaymentAndCurrencies() {
  console.log('💰 Seeding Payment Methods...');

  const paymentMethods = [
    {
      name: 'Stripe',
      slug: 'stripe',
      type: 'stripe',
      isEnabled: false,
      isDefault: true,
      displayName: 'Credit/Debit Card',
      description: 'Pay securely with Visa, Mastercard, or American Express',
      icon: 'stripe',
      sortOrder: 1,
      configuration: {},
      supportedCurrencies: ['USD', 'EUR', 'GBP'],
      minimumAmount: 1,
    },
    {
      name: 'PayPal',
      slug: 'paypal',
      type: 'paypal',
      isEnabled: false,
      displayName: 'PayPal',
      description: 'Pay with your PayPal account',
      icon: 'paypal',
      sortOrder: 2,
      configuration: {},
      supportedCurrencies: ['USD', 'EUR', 'GBP'],
      minimumAmount: 1,
    },
{
  name: 'M-Pesa',
  slug: 'mpesa',
  type: 'mpesa',
  isEnabled: false,
  displayName: 'M-Pesa',
  description: 'Pay via M-Pesa mobile money',
  icon: 'mpesa',
  sortOrder: 3,
  configuration: {
    paybill: { enabled: false, paybillNumber: '', passkey: '' },
    till: { enabled: false, tillNumber: '', passkey: '' },
    stkPush: { enabled: false, shortcode: '', passkey: '' },
    sendMoney: { enabled: false, phoneNumber: '' },
  },
  supportedCurrencies: ['KES'],
  minimumAmount: 1,
},
    {
      name: 'Bank Transfer',
      slug: 'bank_transfer',
      type: 'bank_transfer',
      isEnabled: false,
      displayName: 'Bank Transfer',
      description: 'Pay via direct bank transfer',
      icon: 'bank',
      sortOrder: 4,
      configuration: {
        bankName: '',
        accountName: '',
        accountNumber: '',
        swiftCode: '',
        routingNumber: '',
        branchName: '',
        instructions: 'Please use your invoice number as the payment reference.',
      },
      supportedCurrencies: ['USD', 'KES', 'EUR', 'GBP'],
      minimumAmount: 10,
    },
  ];

  for (const method of paymentMethods) {
    await PaymentMethod.findOneAndUpdate(
      { slug: method.slug },
      method,
      { upsert: true, new: true }
    );
  }

  console.log(`  ✅ ${paymentMethods.length} payment methods seeded`);

  console.log('💱 Seeding Currencies...');

  const currencies = [
    {
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      symbolPosition: 'before',
      decimalPlaces: 2,
      thousandsSeparator: ',',
      decimalSeparator: '.',
      isActive: true,
      isDefault: true,
      exchangeRateToUSD: 1,
      countries: ['US'],
      flag: '🇺🇸',
    },
    {
      code: 'KES',
      name: 'Kenyan Shilling',
      symbol: 'KSh',
      symbolPosition: 'before',
      decimalPlaces: 2,
      thousandsSeparator: ',',
      decimalSeparator: '.',
      isActive: true,
      isDefault: false,
      exchangeRateToUSD: 130,
      countries: ['KE'],
      flag: '🇰🇪',
    },
    {
      code: 'GBP',
      name: 'British Pound',
      symbol: '£',
      symbolPosition: 'before',
      decimalPlaces: 2,
      thousandsSeparator: ',',
      decimalSeparator: '.',
      isActive: true,
      isDefault: false,
      exchangeRateToUSD: 0.79,
      countries: ['GB'],
      flag: '🇬🇧',
    },
    {
      code: 'EUR',
      name: 'Euro',
      symbol: '€',
      symbolPosition: 'before',
      decimalPlaces: 2,
      thousandsSeparator: '.',
      decimalSeparator: ',',
      isActive: true,
      isDefault: false,
      exchangeRateToUSD: 0.92,
      countries: ['EU'],
      flag: '🇪🇺',
    },
  ];

  for (const currency of currencies) {
    await SupportedCurrency.findOneAndUpdate(
      { code: currency.code },
      currency,
      { upsert: true, new: true }
    );
  }

  console.log(`  ✅ ${currencies.length} currencies seeded`);

  console.log('💹 Seeding Exchange Rates...');

  const exchangeRates = [
    { fromCurrency: 'USD', toCurrency: 'KES', rate: 130, source: 'manual' },
    { fromCurrency: 'USD', toCurrency: 'GBP', rate: 0.79, source: 'manual' },
    { fromCurrency: 'USD', toCurrency: 'EUR', rate: 0.92, source: 'manual' },
    { fromCurrency: 'KES', toCurrency: 'USD', rate: 0.0077, source: 'manual' },
    { fromCurrency: 'GBP', toCurrency: 'USD', rate: 1.27, source: 'manual' },
    { fromCurrency: 'EUR', toCurrency: 'USD', rate: 1.09, source: 'manual' },
    { fromCurrency: 'KES', toCurrency: 'GBP', rate: 0.0061, source: 'manual' },
    { fromCurrency: 'KES', toCurrency: 'EUR', rate: 0.0071, source: 'manual' },
    { fromCurrency: 'GBP', toCurrency: 'EUR', rate: 1.16, source: 'manual' },
    { fromCurrency: 'EUR', toCurrency: 'GBP', rate: 0.86, source: 'manual' },
    { fromCurrency: 'GBP', toCurrency: 'KES', rate: 164.56, source: 'manual' },
    { fromCurrency: 'EUR', toCurrency: 'KES', rate: 141.30, source: 'manual' },
  ];

  for (const rate of exchangeRates) {
    await ExchangeRate.findOneAndUpdate(
      { fromCurrency: rate.fromCurrency, toCurrency: rate.toCurrency },
      { ...rate, isActive: true },
      { upsert: true, new: true }
    );
  }

  console.log(`  ✅ ${exchangeRates.length} exchange rates seeded`);
}

async function seedLegal() {
  console.log('⚖️  Seeding Legal Documents...');

  const documents = [
    {
      type: 'terms_of_service',
      title: 'Terms of Service',
      content: '# Terms of Service\n\nLast updated: ' + new Date().toISOString().split('T')[0] + '\n\n## 1. Acceptance of Terms\n\nBy accessing and using HDM BRIDGE, you agree to be bound by these Terms of Service.\n\n## 2. Description of Service\n\nHDM BRIDGE provides an email sending platform for transactional and marketing emails.\n\n## 3. User Obligations\n\nYou agree to use the service in compliance with all applicable laws.\n\n## 4. Prohibited Activities\n\nYou may not use the service for spam, phishing, or any illegal activities.\n\n## 5. Limitation of Liability\n\nHDM BRIDGE is provided "as is" without any warranties.\n\n## 6. Termination\n\nWe reserve the right to terminate accounts that violate these terms.',
      version: 1,
      isPublished: true,
      publishedAt: new Date(),
      effectiveDate: new Date(),
      requiresAcceptance: true,
      changeLog: 'Initial version',
    },
    {
      type: 'privacy_policy',
      title: 'Privacy Policy',
      content: '# Privacy Policy\n\nLast updated: ' + new Date().toISOString().split('T')[0] + '\n\n## 1. Information Collection\n\nWe collect information necessary to provide our email sending services.\n\n## 2. Use of Information\n\nYour data is used solely for providing and improving our services.\n\n## 3. Data Protection\n\nWe implement security measures to protect your data.\n\n## 4. Third-Party Sharing\n\nWe do not sell your personal information.\n\n## 5. Cookies\n\nWe use essential cookies for platform functionality.\n\n## 6. Your Rights\n\nYou have the right to access, correct, or delete your data.',
      version: 1,
      isPublished: true,
      publishedAt: new Date(),
      effectiveDate: new Date(),
      requiresAcceptance: true,
      changeLog: 'Initial version',
    },
    {
      type: 'cookie_policy',
      title: 'Cookie Policy',
      content: '# Cookie Policy\n\n## What Are Cookies\n\nCookies are small text files stored on your device.\n\n## How We Use Cookies\n\nWe use cookies for authentication, preferences, and analytics.\n\n## Managing Cookies\n\nYou can control cookies through your browser settings.',
      version: 1,
      isPublished: true,
      publishedAt: new Date(),
      effectiveDate: new Date(),
      requiresAcceptance: false,
      changeLog: 'Initial version',
    },
    {
      type: 'gdpr',
      title: 'GDPR Compliance',
      content: '# GDPR Compliance\n\n## Data Processing\n\nWe process data in accordance with GDPR requirements.\n\n## Data Subject Rights\n\nEU residents have rights to access, rectify, erase, and port their data.\n\n## Data Protection Officer\n\nContact our DPO at dpo@hdmbridge.com\n\n## International Transfers\n\nData may be processed outside the EU with appropriate safeguards.',
      version: 1,
      isPublished: true,
      publishedAt: new Date(),
      effectiveDate: new Date(),
      requiresAcceptance: false,
      changeLog: 'Initial version',
    },
  ];

  for (const doc of documents) {
    const existing = await LegalDocument.findOne({ type: doc.type, isPublished: true });
    if (!existing) {
      await LegalDocument.create(doc);
    }
  }

  console.log(`  ✅ ${documents.length} legal documents seeded`);
}

async function seedAdminRoles() {
  console.log('👤 Seeding Admin Roles...');

  const roles = [
    {
      name: 'Super Admin',
      slug: 'super_admin',
      description: 'Full platform access with all permissions',
      permissions: [
        'users.view', 'users.create', 'users.edit', 'users.delete', 'users.suspend',
        'payments.view', 'payments.refund', 'payments.manual',
        'plans.view', 'plans.create', 'plans.edit', 'plans.delete',
        'currency.view', 'currency.edit',
        'system.view', 'system.edit',
        'legal.view', 'legal.edit',
        'analytics.view', 'analytics.export',
        'ai_widget.view', 'ai_widget.edit',
        'backup.view', 'backup.create', 'backup.restore', 'backup.delete',
        'admins.view', 'admins.create', 'admins.edit', 'admins.delete',
        'audit.view', 'audit.export',
      ],
      isActive: true,
      isSystem: true,
    },
    {
      name: 'Billing Admin',
      slug: 'billing_admin',
      description: 'Manages payments, plans, and subscriptions',
      permissions: [
        'users.view',
        'payments.view', 'payments.refund', 'payments.manual',
        'plans.view', 'plans.edit',
        'currency.view', 'currency.edit',
        'analytics.view',
        'audit.view',
      ],
      isActive: true,
      isSystem: true,
    },
    {
      name: 'Support Admin',
      slug: 'support_admin',
      description: 'Manages users and support functions',
      permissions: [
        'users.view', 'users.edit', 'users.suspend',
        'payments.view',
        'analytics.view',
        'legal.view',
        'audit.view',
      ],
      isActive: true,
      isSystem: true,
    },
    {
      name: 'Viewer',
      slug: 'viewer',
      description: 'Read-only access to platform analytics and data',
      permissions: [
        'users.view',
        'payments.view',
        'plans.view',
        'analytics.view',
        'audit.view',
      ],
      isActive: true,
      isSystem: true,
    },
  ];

  let superAdminRoleId = null;
  for (const role of roles) {
    const existing = await AdminRole.findOne({ slug: role.slug });
    if (!existing) {
      const created = await AdminRole.create(role);
      if (role.slug === 'super_admin') superAdminRoleId = created._id;
    } else if (role.slug === 'super_admin') {
      superAdminRoleId = existing._id;
    }
  }

  console.log(`  ✅ ${roles.length} admin roles seeded`);

  console.log('👑 Seeding Default Admin...');

  const existingAdmin = await AdminUser.findOne({ email: 'admin@hdmbridge.com' });
  if (!existingAdmin && superAdminRoleId) {
    await AdminUser.create({
      email: 'admin@hdmbridge.com',
      password: 'Admin@123',
      firstName: 'Super',
      lastName: 'Admin',
      role: superAdminRoleId,
      isSuperAdmin: true,
      isActive: true,
    });
    console.log('  ✅ Default admin created (admin@hdmbridge.com / Admin@123)');
  } else {
    console.log('  ℹ️  Default admin already exists');
  }
}

async function seedAIWidget() {
  console.log('🤖 Seeding AI Widget Settings...');

  const existing = await AIWidgetSetting.findOne({ isActive: true });
  if (!existing) {
    await AIWidgetSetting.create({
      isEnabled: false,
      provider: 'hdm',
      apiKey: 'hdm_gen_94b1a42c30805c31852105c287a5812272857a0af82e1e58',
      baseUrl: 'https://hdmai-server.onrender.com/api/v1/general/chat/public',
      model: 'hdm-gpt',
      interface: 'client',
      temperature: 0.7,
      maxTokens: 1024,
      rateLimitPerUser: 10,
      appearance: {
        title: 'HDM Bridge Support',
        subtitle: 'Ask me anything!',
        welcomeMessage: 'Hello! How can I help you today?',
        primaryColor: '#4F46E5',
        position: 'bottom-right',
      },
      contextInjection: {
        includeUserPlan: true,
        includeUsageStats: true,
        includeSubscription: true,
        includeRecentActivity: false,
      },
    });
    console.log('  ✅ AI widget settings seeded with HDM AI');
  } else {
    console.log('  ℹ️  AI widget settings already exist');
  }
}

async function seedBackup() {
  console.log('💾 Seeding Backup Config...');

  const existing = await Backup.findOne({ isScheduled: true, 'scheduleConfig.enabled': true });
  if (!existing) {
    await Backup.create({
      name: 'Daily Backup',
      type: 'database',
      isScheduled: true,
      scheduleConfig: {
        cronExpression: '0 2 * * *',
        frequency: 'daily',
        time: '02:00',
        day: '*',
        enabled: true,
      },
      status: 'completed',
    });
    console.log('  ✅ Backup schedule seeded');
  } else {
    console.log('  ℹ️  Backup schedule already exists');
  }
}

async function start() {
  try {
    await connectDB();
    console.log('✅ Connected to database\n');
    await mainMenu();
  } catch (error) {
    console.error('❌ Failed to connect:', error.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n👋 Goodbye!\n');
  process.exit(0);
});

start();