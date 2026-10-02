const SystemSetting = require('../models/admin/SystemSetting');

const DEFAULTS = {
  appName: 'HDM BRIDGE',
  supportEmail: 'support@hdmbridge.com',
  supportPhone: '',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  adminUrl: process.env.ADMIN_URL || 'http://localhost:3001',
};

async function loadBranding() {
  try {
    const rows = await SystemSetting.find({
      key: { $in: ['app_name', 'support_email', 'contact_phone'] },
    }).lean();
    const map = {};
    rows.forEach((r) => { map[r.key] = r.value; });
    return {
      appName: map.app_name || DEFAULTS.appName,
      supportEmail: map.support_email || DEFAULTS.supportEmail,
      supportPhone: map.contact_phone || DEFAULTS.supportPhone,
      clientUrl: DEFAULTS.clientUrl,
      adminUrl: DEFAULTS.adminUrl,
    };
  } catch {
    return DEFAULTS;
  }
}

function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(amount, currency = 'USD') {
  const n = Number(amount || 0);
  const symbols = { USD: '$', KES: 'KSh', EUR: '€', GBP: '£' };
  const symbol = symbols[currency] || currency + ' ';
  return symbol + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function shell({ branding, headerColor, headerTitle, headerSubtitle, body, footerNote }) {
  const color = headerColor || '#4F46E5';
  const phone = branding.supportPhone;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:Arial,Helvetica,sans-serif;background:#f4f4f5;margin:0;padding:0;color:#1f2937}
.container{max-width:600px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
.header{background:${color};color:#ffffff;padding:28px 30px;text-align:center}
.header h1{margin:0;font-size:22px;font-weight:700;letter-spacing:.2px}
.header p{margin:6px 0 0;font-size:13px;opacity:.9}
.body{padding:28px 30px;color:#374151;line-height:1.6;font-size:15px}
.body h2{margin:0 0 14px;color:#111827;font-size:20px}
.body p{margin:10px 0}
.body ul,.body ol{margin:10px 0;padding-left:22px}
.body li{margin:4px 0}
.button{display:inline-block;background:${color};color:#ffffff !important;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;margin:14px 0}
.button-secondary{background:#ffffff;color:${color} !important;border:1px solid ${color}}
.footer{background:#f9fafb;padding:20px 30px;text-align:center;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb}
.footer p{margin:3px 0}
.data-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eef0f3;font-size:14px}
.data-row:last-child{border-bottom:none}
.data-label{font-weight:600;color:#6b7280}
.data-value{color:#111827;text-align:right}
.mono{font-family:Menlo,Consolas,monospace;background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:13px}
.box{background:#f9fafb;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #eef0f3}
.box-green{background:#f0fdf4;border-color:#bbf7d0}
.box-blue{background:#eff6ff;border-color:#bfdbfe}
.box-yellow{background:#fefce8;border-color:#fde68a}
.box-red{background:#fef2f2;border-color:#fecaca}
.box h3{margin:0 0 8px;font-size:15px;color:#111827}
.alert{padding:14px 16px;border-radius:8px;margin:14px 0;border-left:4px solid}
.alert-info{background:#eff6ff;border-color:#3b82f6;color:#1e40af}
.alert-success{background:#f0fdf4;border-color:#22c55e;color:#166534}
.alert-warning{background:#fefce8;border-color:#eab308;color:#854d0e}
.alert-danger{background:#fef2f2;border-color:#ef4444;color:#991b1b}
.muted{color:#6b7280;font-size:13px}
.center{text-align:center}
.divider{border:0;border-top:1px solid #eef0f3;margin:20px 0}
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>${esc(branding.appName)}</h1>
${headerSubtitle ? `<p>${esc(headerSubtitle)}</p>` : ''}
${headerTitle ? `<h2 style="margin:10px 0 0;color:#ffffff;font-size:18px">${esc(headerTitle)}</h2>` : ''}
</div>
<div class="body">
${body}
</div>
<div class="footer">
<p><strong>${esc(branding.appName)}</strong></p>
${phone ? `<p>📞 ${esc(phone)}</p>` : ''}
<p>📧 ${esc(branding.supportEmail)}</p>
${footerNote ? `<p>${esc(footerNote)}</p>` : ''}
<p>© ${new Date().getFullYear()} ${esc(branding.appName)}. All rights reserved.</p>
</div>
</div>
</body>
</html>`;
}

function dataRow(label, value, mono) {
  if (value === null || value === undefined || value === '') return '';
  return `<div class="data-row"><span class="data-label">${esc(label)}</span><span class="data-value">${mono ? `<span class="mono">${esc(value)}</span>` : esc(value)}</span></div>`;
}

function alertBox(kind, text) {
  const cls = { info: 'alert-info', success: 'alert-success', warning: 'alert-warning', danger: 'alert-danger' }[kind] || 'alert-info';
  return `<div class="alert ${cls}">${text}</div>`;
}

function button(href, label, secondary) {
  if (!href) return '';
  return `<div class="center"><a href="${esc(href)}" class="button${secondary ? ' button-secondary' : ''}">${esc(label)}</a></div>`;
}

function toText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function render({ subject, headerColor, headerTitle, headerSubtitle, body, footerNote }) {
  const branding = await loadBranding();
  const html = shell({ branding, headerColor, headerTitle, headerSubtitle, body, footerNote });
  return { subject, html, text: toText(html) };
}

/* ========================= AUTH ========================= */

async function verifyEmail({ firstName, verifyUrl, expiresHours = 24 }) {
  return render({
    subject: 'Verify your email address',
    headerTitle: 'Verify your email',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p>Thanks for signing up. Please confirm your email address to activate your account.</p>
      ${button(verifyUrl, 'Verify Email Address')}
      <p class="muted">This link expires in ${esc(expiresHours)} hours. If you didn't create an account, you can ignore this email.</p>
    `,
    footerNote: 'Need help? Reply to this email.',
  });
}

async function welcome({ firstName, dashboardUrl }) {
  return render({
    subject: 'Welcome aboard',
    headerColor: '#059669',
    headerTitle: 'Welcome!',
    body: `
      <h2>Welcome, ${esc(firstName || 'there')}!</h2>
      <p>Your account is active and ready to use.</p>
      <ul>
        <li>Create API keys</li>
        <li>Verify your sending domains</li>
        <li>Start sending with our API</li>
      </ul>
      ${button(dashboardUrl || DEFAULTS.clientUrl + '/dashboard', 'Go to Dashboard')}
    `,
  });
}

async function passwordReset({ firstName, resetUrl, expiresMinutes = 30 }) {
  return render({
    subject: 'Reset your password',
    headerTitle: 'Password reset',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p>We received a request to reset your password. Click the button below to choose a new one.</p>
      ${button(resetUrl, 'Reset Password')}
      <p class="muted">This link expires in ${esc(expiresMinutes)} minutes. If you didn't request this, no action is needed — your password is unchanged.</p>
    `,
  });
}

async function passwordChanged({ firstName, at, ip, userAgent }) {
  return render({
    subject: 'Your password was changed',
    headerColor: '#dc2626',
    headerTitle: 'Security notice',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      ${alertBox('warning', 'Your account password was changed.')}
      ${dataRow('When', fmtDateTime(at))}
      ${dataRow('IP', ip || '—', true)}
      ${dataRow('Device', userAgent || '—')}
      <p>If this wasn't you, reset your password immediately and contact support.</p>
    `,
  });
}

async function newDeviceLogin({ firstName, at, ip, userAgent, location }) {
  return render({
    subject: 'New sign-in detected',
    headerTitle: 'New sign-in',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p>We noticed a sign-in to your account from a new device.</p>
      ${dataRow('When', fmtDateTime(at))}
      ${dataRow('IP', ip || '—', true)}
      ${dataRow('Location', location || '—')}
      ${dataRow('Device', userAgent || '—')}
      <p>If this was you, no action is needed. If not, change your password and contact support.</p>
    `,
  });
}

/* ========================= TEAM ========================= */

async function teamMemberInvited({ inviteeName, orgName, inviterName, role, inviteUrl, expiresDays = 7 }) {
  return render({
    subject: `You're invited to join ${orgName || 'a team'}`,
    headerTitle: 'Team invitation',
    body: `
      <h2>Hi ${esc(inviteeName || 'there')},</h2>
      <p><strong>${esc(inviterName || 'An admin')}</strong> invited you to join <strong>${esc(orgName || 'their organization')}</strong> as a <strong>${esc(role || 'member')}</strong>.</p>
      ${button(inviteUrl, 'Accept Invitation')}
      <p class="muted">This invite expires in ${esc(expiresDays)} days.</p>
    `,
  });
}

async function teamMemberJoined({ ownerName, memberName, memberEmail, role }) {
  return render({
    subject: `${memberName || 'A new member'} joined your team`,
    headerColor: '#059669',
    headerTitle: 'New team member',
    body: `
      <h2>Hi ${esc(ownerName || 'there')},</h2>
      <p>A new member has joined your organization.</p>
      ${dataRow('Name', memberName)}
      ${dataRow('Email', memberEmail)}
      ${dataRow('Role', role)}
    `,
  });
}

async function teamMemberRemoved({ memberName, orgName, removedByName }) {
  return render({
    subject: `You were removed from ${orgName || 'the organization'}`,
    headerColor: '#dc2626',
    headerTitle: 'Access removed',
    body: `
      <h2>Hi ${esc(memberName || 'there')},</h2>
      <p>Your access to <strong>${esc(orgName || 'the organization')}</strong> has been removed${removedByName ? ` by ${esc(removedByName)}` : ''}.</p>
      <p>If you believe this is a mistake, contact your organization admin or our support team.</p>
    `,
  });
}

async function roleChanged({ memberName, orgName, oldRole, newRole, changedByName }) {
  return render({
    subject: 'Your role has been updated',
    headerTitle: 'Role updated',
    body: `
      <h2>Hi ${esc(memberName || 'there')},</h2>
      <p>Your role in <strong>${esc(orgName || 'the organization')}</strong> has been updated${changedByName ? ` by ${esc(changedByName)}` : ''}.</p>
      ${dataRow('Previous role', oldRole)}
      ${dataRow('New role', newRole)}
    `,
  });
}

/* ========================= API KEYS ========================= */

async function apiKeyCreated({ firstName, keyName, prefix, scopes }) {
  return render({
    subject: 'New API key created',
    headerTitle: 'API key created',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p>A new API key was created on your account.</p>
      ${dataRow('Name', keyName)}
      ${dataRow('Prefix', prefix, true)}
      ${dataRow('Scopes', (scopes || []).join(', '))}
      ${alertBox('warning', 'If you did not create this key, revoke it immediately and contact support.')}
    `,
  });
}

async function apiKeyRevoked({ firstName, keyName, prefix, revokedBy }) {
  return render({
    subject: 'API key revoked',
    headerColor: '#dc2626',
    headerTitle: 'API key revoked',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p>An API key was revoked on your account.</p>
      ${dataRow('Name', keyName)}
      ${dataRow('Prefix', prefix, true)}
      ${dataRow('Revoked by', revokedBy)}
    `,
  });
}

/* ========================= DOMAINS ========================= */

async function domainAdded({ firstName, domain }) {
  return render({
    subject: `Domain added: ${domain}`,
    headerTitle: 'Domain added',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p><strong>${esc(domain)}</strong> has been added to your account. Add the DNS records and click Verify to complete setup.</p>
    `,
  });
}

async function domainVerified({ firstName, domain }) {
  return render({
    subject: `Domain verified: ${domain}`,
    headerColor: '#059669',
    headerTitle: 'Domain verified',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      ${alertBox('success', `<strong>${esc(domain)}</strong> is now verified. You can send from this domain.`)}
    `,
  });
}

async function domainVerificationFailed({ firstName, domain, attempts, reasons }) {
  return render({
    subject: `Domain verification failed: ${domain}`,
    headerColor: '#dc2626',
    headerTitle: 'Verification failed',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      ${alertBox('danger', `We couldn't verify <strong>${esc(domain)}</strong>.`)}
      ${dataRow('Attempts', attempts)}
      ${reasons && reasons.length ? `<div class="box"><h3>What's missing</h3><ul>${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    `,
  });
}

/* ========================= SENDERS ========================= */

async function senderAdded({ firstName, senderName, senderEmail }) {
  return render({
    subject: `Sender added: ${senderEmail}`,
    headerTitle: 'Sender added',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p>A new sender was added to your account.</p>
      ${dataRow('Name', senderName)}
      ${dataRow('Email', senderEmail)}
      <p>Complete verification to start sending from this address.</p>
    `,
  });
}

async function senderVerified({ firstName, senderEmail }) {
  return render({
    subject: `Sender verified: ${senderEmail}`,
    headerColor: '#059669',
    headerTitle: 'Sender verified',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      ${alertBox('success', `<strong>${esc(senderEmail)}</strong> is verified and ready to send.`)}
    `,
  });
}

/* ========================= BILLING ========================= */

async function invoiceCreated({ firstName, invoiceNumber, planName, amount, currency, dueDate, paymentInstructions, invoiceUrl }) {
  const instrHtml = (paymentInstructions || []).map((m) => {
    const steps = (m.steps || []).map((s) => `<li>${esc(s)}</li>`).join('');
    return `
      <div class="box">
        <h3>${esc(m.title || m.code)}</h3>
        ${m.description ? `<p class="muted">${esc(m.description)}</p>` : ''}
        ${steps ? `<ol>${steps}</ol>` : ''}
      </div>
    `;
  }).join('');

  return render({
    subject: `Invoice ${invoiceNumber} — ${planName} plan`,
    headerTitle: 'Your invoice',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p>Your invoice for the <strong>${esc(planName)}</strong> plan is ready.</p>
      <div class="box box-green">
        ${dataRow('Invoice', invoiceNumber, true)}
        ${dataRow('Plan', planName)}
        ${dataRow('Amount due', money(amount, currency))}
        ${dataRow('Due by', fmtDateTime(dueDate))}
      </div>
      ${instrHtml ? `<div class="box box-blue"><h3>How to pay</h3>${instrHtml}</div>` : ''}
      ${button(invoiceUrl, 'View Invoice & Pay')}
    `,
  });
}

async function paymentReceived({ firstName, invoiceNumber, planName, amount, currency, method, reference, paidAt }) {
  return render({
    subject: `Payment received — ${invoiceNumber}`,
    headerColor: '#059669',
    headerTitle: 'Payment received',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      ${alertBox('success', 'We received your payment. Thank you!')}
      <div class="box box-green">
        ${dataRow('Invoice', invoiceNumber, true)}
        ${dataRow('Plan', planName)}
        ${dataRow('Amount', money(amount, currency))}
        ${dataRow('Method', method)}
        ${dataRow('Reference', reference, true)}
        ${dataRow('Date', fmtDateTime(paidAt))}
      </div>
      <p>Your plan is now active. You can start using it right away.</p>
    `,
  });
}

async function paymentConfirmed({ firstName, invoiceNumber, planName, amount, currency, method, reference, confirmedAt }) {
  return render({
    subject: `Payment confirmed — ${invoiceNumber}`,
    headerColor: '#059669',
    headerTitle: 'Payment confirmed',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p>Our team confirmed your manual payment. Your plan is now active.</p>
      <div class="box box-green">
        ${dataRow('Invoice', invoiceNumber, true)}
        ${dataRow('Plan', planName)}
        ${dataRow('Amount', money(amount, currency))}
        ${dataRow('Method', method)}
        ${dataRow('Reference', reference, true)}
        ${dataRow('Confirmed', fmtDateTime(confirmedAt))}
      </div>
    `,
  });
}

async function paymentRejected({ firstName, invoiceNumber, reason, supportUrl }) {
  return render({
    subject: `Payment issue — ${invoiceNumber}`,
    headerColor: '#dc2626',
    headerTitle: 'Payment not confirmed',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      ${alertBox('danger', 'We could not confirm your payment.')}
      ${dataRow('Invoice', invoiceNumber, true)}
      ${reason ? `${dataRow('Reason', reason)}` : ''}
      <p>If you believe this is a mistake, contact support with your payment reference.</p>
      ${button(supportUrl, 'Contact Support', true)}
    `,
  });
}

async function subscriptionActivated({ firstName, planName, periodStart, periodEnd, dashboardUrl }) {
  return render({
    subject: `Your ${planName} plan is active`,
    headerColor: '#059669',
    headerTitle: 'Subscription active',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p>Your <strong>${esc(planName)}</strong> plan is now active.</p>
      <div class="box box-green">
        ${dataRow('Plan', planName)}
        ${dataRow('Starts', fmtDate(periodStart))}
        ${dataRow('Renews', fmtDate(periodEnd))}
      </div>
      ${button(dashboardUrl || DEFAULTS.clientUrl + '/dashboard', 'Go to Dashboard')}
    `,
  });
}

async function subscriptionRenewed({ firstName, planName, amount, currency, periodEnd, invoiceNumber }) {
  return render({
    subject: `Renewal successful — ${planName}`,
    headerColor: '#059669',
    headerTitle: 'Subscription renewed',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p>Your <strong>${esc(planName)}</strong> subscription renewed successfully.</p>
      <div class="box box-green">
        ${dataRow('Invoice', invoiceNumber, true)}
        ${dataRow('Amount', money(amount, currency))}
        ${dataRow('Valid until', fmtDate(periodEnd))}
      </div>
    `,
  });
}

async function subscriptionExpiring({ firstName, planName, daysLeft, periodEnd, billingUrl }) {
  return render({
    subject: `Your ${planName} plan renews in ${daysLeft} days`,
    headerColor: '#eab308',
    headerTitle: 'Renewal reminder',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      ${alertBox('warning', `Your <strong>${esc(planName)}</strong> plan renews on <strong>${esc(fmtDate(periodEnd))}</strong> (${esc(daysLeft)} days).`)}
      <p>Make sure your payment method is up to date to avoid interruption.</p>
      ${button(billingUrl || DEFAULTS.clientUrl + '/billing', 'Manage Billing')}
    `,
  });
}

async function subscriptionExpired({ firstName, planName, expiredAt, billingUrl }) {
  return render({
    subject: `Your ${planName} plan has expired`,
    headerColor: '#dc2626',
    headerTitle: 'Subscription expired',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      ${alertBox('danger', `Your <strong>${esc(planName)}</strong> plan expired on ${esc(fmtDate(expiredAt))}.`)}
      <p>You've been moved to the Free plan. Upgrade anytime to restore your limits.</p>
      ${button(billingUrl || DEFAULTS.clientUrl + '/billing', 'Upgrade Plan')}
    `,
  });
}

async function subscriptionCancelled({ firstName, planName, cancelledAt, accessUntil, billingUrl }) {
  return render({
    subject: `Subscription cancelled`,
    headerColor: '#dc2626',
    headerTitle: 'Subscription cancelled',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p>Your <strong>${esc(planName)}</strong> subscription has been cancelled.</p>
      <div class="box">
        ${dataRow('Cancelled', fmtDateTime(cancelledAt))}
        ${dataRow('Access until', fmtDate(accessUntil))}
      </div>
      <p>You can reactivate anytime before this date to keep your plan.</p>
      ${button(billingUrl || DEFAULTS.clientUrl + '/billing', 'Reactivate', true)}
    `,
  });
}

async function invoiceExpiring({ firstName, invoiceNumber, amount, currency, minutesLeft, invoiceUrl }) {
  return render({
    subject: `Reminder: invoice ${invoiceNumber} is due soon`,
    headerColor: '#eab308',
    headerTitle: 'Invoice reminder',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      ${alertBox('warning', `Invoice <strong>${esc(invoiceNumber)}</strong> for <strong>${esc(money(amount, currency))}</strong> is due in ${esc(minutesLeft)} minutes.`)}
      ${button(invoiceUrl, 'Pay Now')}
    `,
  });
}

async function invoiceExpired({ firstName, invoiceNumber, planName, invoiceUrl }) {
  return render({
    subject: `Invoice ${invoiceNumber} has expired`,
    headerColor: '#dc2626',
    headerTitle: 'Invoice expired',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      ${alertBox('danger', `Invoice <strong>${esc(invoiceNumber)}</strong> for the <strong>${esc(planName)}</strong> plan has expired without payment.`)}
      <p>You can generate a new invoice and try again anytime.</p>
      ${button(invoiceUrl || DEFAULTS.clientUrl + '/billing', 'Try Again')}
    `,
  });
}

async function planUpgraded({ firstName, oldPlan, newPlan, periodEnd, dashboardUrl }) {
  return render({
    subject: `You're now on ${newPlan}`,
    headerColor: '#059669',
    headerTitle: 'Plan upgraded',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      ${alertBox('success', `Your plan has been upgraded from <strong>${esc(oldPlan)}</strong> to <strong>${esc(newPlan)}</strong>.`)}
      ${dataRow('New plan', newPlan)}
      ${dataRow('Valid until', fmtDate(periodEnd))}
      ${button(dashboardUrl || DEFAULTS.clientUrl + '/dashboard', 'Go to Dashboard')}
    `,
  });
}

async function planDowngraded({ firstName, oldPlan, newPlan, effectiveAt, billingUrl }) {
  return render({
    subject: `Plan change scheduled`,
    headerTitle: 'Plan downgrade',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p>Your plan will change from <strong>${esc(oldPlan)}</strong> to <strong>${esc(newPlan)}</strong> on ${esc(fmtDate(effectiveAt))}.</p>
      <p>Until then, your current plan stays active.</p>
      ${button(billingUrl || DEFAULTS.clientUrl + '/billing', 'Manage Billing', true)}
    `,
  });
}

/* ========================= QUOTA ========================= */

async function quotaWarning({ firstName, period, current, limit, percentUsed, upgradeUrl }) {
  return render({
    subject: `You've used ${percentUsed}% of your ${period} quota`,
    headerColor: '#eab308',
    headerTitle: 'Usage warning',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      ${alertBox('warning', `You've used <strong>${esc(percentUsed)}%</strong> of your ${esc(period)} email quota.`)}
      <div class="box">
        ${dataRow('Used', Number(current || 0).toLocaleString())}
        ${dataRow('Limit', Number(limit || 0).toLocaleString())}
      </div>
      <p>Upgrade to avoid interruption when you hit the limit.</p>
      ${button(upgradeUrl || DEFAULTS.clientUrl + '/billing', 'Upgrade Plan')}
    `,
  });
}

async function quotaExceeded({ firstName, period, limit, upgradeUrl }) {
  return render({
    subject: `You've reached your ${period} limit`,
    headerColor: '#dc2626',
    headerTitle: 'Quota exceeded',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      ${alertBox('danger', `You've reached your ${esc(period)} limit of <strong>${Number(limit || 0).toLocaleString()}</strong> emails.`)}
      <p>Further sends will be rejected until your quota resets or you upgrade.</p>
      ${button(upgradeUrl || DEFAULTS.clientUrl + '/billing', 'Upgrade Now')}
    `,
  });
}

async function usageReportWeekly({ firstName, period, totalSent, delivered, opened, clicked, bounced, dashboardUrl }) {
  return render({
    subject: `Your weekly usage summary`,
    headerTitle: 'Weekly report',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p>Here's how your account performed for the week of ${esc(fmtDate(period?.from))} – ${esc(fmtDate(period?.to))}.</p>
      <div class="box box-blue">
        ${dataRow('Sent', Number(totalSent || 0).toLocaleString())}
        ${dataRow('Delivered', Number(delivered || 0).toLocaleString())}
        ${dataRow('Opened', Number(opened || 0).toLocaleString())}
        ${dataRow('Clicked', Number(clicked || 0).toLocaleString())}
        ${dataRow('Bounced', Number(bounced || 0).toLocaleString())}
      </div>
      ${button(dashboardUrl || DEFAULTS.clientUrl + '/dashboard', 'Open Dashboard')}
    `,
  });
}

/* ========================= ADMIN ========================= */

async function adminNewUser({ adminName, userName, userEmail, organizationName, registeredAt }) {
  return render({
    subject: `New user: ${userName || userEmail}`,
    headerTitle: 'New user registered',
    body: `
      <h2>Hi ${esc(adminName || 'there')},</h2>
      <p>A new user just registered.</p>
      <div class="box">
        ${dataRow('Name', userName)}
        ${dataRow('Email', userEmail)}
        ${dataRow('Organization', organizationName)}
        ${dataRow('Registered', fmtDateTime(registeredAt))}
      </div>
    `,
  });
}

async function adminNewOrganization({ adminName, orgName, ownerEmail, planName, createdAt }) {
  return render({
    subject: `New organization: ${orgName}`,
    headerTitle: 'New organization',
    body: `
      <h2>Hi ${esc(adminName || 'there')},</h2>
      <div class="box">
        ${dataRow('Organization', orgName)}
        ${dataRow('Owner', ownerEmail)}
        ${dataRow('Plan', planName)}
        ${dataRow('Created', fmtDateTime(createdAt))}
      </div>
    `,
  });
}

async function adminPaymentReceived({ adminName, orgName, userEmail, planName, amount, currency, method, reference, invoiceNumber }) {
  return render({
    subject: `Payment received — ${orgName || userEmail}`,
    headerColor: '#059669',
    headerTitle: 'Payment received',
    body: `
      <h2>Hi ${esc(adminName || 'there')},</h2>
      ${alertBox('success', 'A payment has been processed automatically.')}
      <div class="box box-green">
        ${dataRow('Organization', orgName)}
        ${dataRow('User', userEmail)}
        ${dataRow('Plan', planName)}
        ${dataRow('Amount', money(amount, currency))}
        ${dataRow('Method', method)}
        ${dataRow('Reference', reference, true)}
        ${dataRow('Invoice', invoiceNumber, true)}
      </div>
    `,
  });
}

async function adminManualPaymentPending({ adminName, orgName, userEmail, planName, amount, currency, invoiceNumber, invoiceUrl }) {
  return render({
    subject: `Manual payment needs confirmation — ${invoiceNumber}`,
    headerColor: '#eab308',
    headerTitle: 'Manual payment pending',
    body: `
      <h2>Hi ${esc(adminName || 'there')},</h2>
      <p>An invoice is awaiting manual confirmation. Match it against your M-Pesa or bank statement, then confirm.</p>
      <div class="box box-yellow">
        ${dataRow('Invoice', invoiceNumber, true)}
        ${dataRow('Organization', orgName)}
        ${dataRow('User', userEmail)}
        ${dataRow('Plan', planName)}
        ${dataRow('Amount', money(amount, currency))}
      </div>
      ${button(invoiceUrl, 'Review Invoice')}
    `,
  });
}

async function adminSubscriptionCancelled({ adminName, orgName, userEmail, planName, cancelledAt }) {
  return render({
    subject: `Subscription cancelled — ${orgName || userEmail}`,
    headerColor: '#dc2626',
    headerTitle: 'Subscription cancelled',
    body: `
      <h2>Hi ${esc(adminName || 'there')},</h2>
      <div class="box">
        ${dataRow('Organization', orgName)}
        ${dataRow('User', userEmail)}
        ${dataRow('Plan', planName)}
        ${dataRow('Cancelled', fmtDateTime(cancelledAt))}
      </div>
    `,
  });
}

async function adminDomainVerificationFailed({ adminName, orgName, domain, attempts, lastError }) {
  return render({
    subject: `Domain verification failed — ${domain}`,
    headerColor: '#dc2626',
    headerTitle: 'Domain verification failed',
    body: `
      <h2>Hi ${esc(adminName || 'there')},</h2>
      <div class="box">
        ${dataRow('Organization', orgName)}
        ${dataRow('Domain', domain)}
        ${dataRow('Attempts', attempts)}
        ${dataRow('Last error', lastError)}
      </div>
    `,
  });
}

async function adminQuotaExceeded({ adminName, orgName, period, limit, email }) {
  return render({
    subject: `Quota exceeded — ${orgName}`,
    headerColor: '#eab308',
    headerTitle: 'Organization hit quota',
    body: `
      <h2>Hi ${esc(adminName || 'there')},</h2>
      <div class="box">
        ${dataRow('Organization', orgName)}
        ${dataRow('Plan period', period)}
        ${dataRow('Limit', Number(limit || 0).toLocaleString())}
        ${dataRow('Owner', email)}
      </div>
    `,
  });
}

async function adminNewAdmin({ adminName, newAdminName, newAdminEmail, role }) {
  return render({
    subject: 'New admin account created',
    headerTitle: 'New admin',
    body: `
      <h2>Hi ${esc(adminName || 'there')},</h2>
      <div class="box">
        ${dataRow('Name', newAdminName)}
        ${dataRow('Email', newAdminEmail)}
        ${dataRow('Role', role)}
      </div>
    `,
  });
}

async function adminSystemHealth({ adminName, service, status, details, at }) {
  return render({
    subject: `System alert: ${service} ${status}`,
    headerColor: '#dc2626',
    headerTitle: 'System health alert',
    body: `
      <h2>Hi ${esc(adminName || 'there')},</h2>
      ${alertBox('danger', `<strong>${esc(service)}</strong> is <strong>${esc(status)}</strong>.`)}
      ${dataRow('When', fmtDateTime(at))}
      ${details ? `<div class="box"><h3>Details</h3><pre style="margin:0;white-space:pre-wrap;font-size:13px">${esc(details)}</pre></div>` : ''}
    `,
  });
}

async function adminWeeklyDigest({ adminName, period, totalUsers, totalOrgs, totalEmails, totalRevenue, currency, dashboardUrl }) {
  return render({
    subject: 'Weekly platform digest',
    headerTitle: 'Weekly digest',
    body: `
      <h2>Hi ${esc(adminName || 'there')},</h2>
      <p>Platform snapshot for ${esc(fmtDate(period?.from))} – ${esc(fmtDate(period?.to))}.</p>
      <div class="box box-blue">
        ${dataRow('Users', Number(totalUsers || 0).toLocaleString())}
        ${dataRow('Organizations', Number(totalOrgs || 0).toLocaleString())}
        ${dataRow('Emails sent', Number(totalEmails || 0).toLocaleString())}
        ${dataRow('Revenue', money(totalRevenue, currency))}
      </div>
      ${button(dashboardUrl || DEFAULTS.adminUrl + '/analytics', 'Open Analytics')}
    `,
  });
}

/* ========================= BROADCAST ========================= */

async function broadcastToUser({ firstName, subject, messageHtml, messageText }) {
  return render({
    subject: subject || 'A message from us',
    headerTitle: 'Announcement',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      ${messageHtml || `<p>${esc(messageText || '')}</p>`}
    `,
  });
}

async function broadcastToAll({ firstName, subject, messageHtml, messageText }) {
  return render({
    subject: subject || 'Announcement from us',
    headerTitle: 'Announcement',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      ${messageHtml || `<p>${esc(messageText || '')}</p>`}
      <hr class="divider">
      <p class="muted">You are receiving this because you have an account. Manage preferences in your settings.</p>
    `,
  });
}

/* ========================= SUPPORT & MISC ========================= */

async function supportAcknowledged({ firstName, ticketId, subject, supportUrl }) {
  return render({
    subject: `We received your message`,
    headerTitle: 'Support request received',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p>We received your support request and our team will get back to you shortly.</p>
      ${dataRow('Ticket', ticketId, true)}
      ${dataRow('Subject', subject)}
      ${button(supportUrl, 'View Ticket', true)}
    `,
  });
}

async function contactConfirmation({ name, email, subject, message, supportEmail }) {
  return render({
    subject: 'We got your message',
    headerTitle: 'Message received',
    body: `
      <h2>Hi ${esc(name || 'there')},</h2>
      <p>Thanks for reaching out. We'll respond to <strong>${esc(email)}</strong> within one business day.</p>
      ${subject ? dataRow('Subject', subject) : ''}
      ${message ? `<div class="box"><h3>Your message</h3><p>${esc(message)}</p></div>` : ''}
      <p class="muted">If you need urgent help, email ${esc(supportEmail || DEFAULTS.supportEmail)}.</p>
    `,
  });
}

async function legalUpdate({ firstName, docType, version, effectiveDate, readUrl }) {
  return render({
    subject: `We've updated our ${docType}`,
    headerTitle: 'Policy update',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p>Our <strong>${esc(docType)}</strong> has been updated (v${esc(version)}). The changes take effect on ${esc(fmtDate(effectiveDate))}.</p>
      <p>By continuing to use your account, you agree to the updated terms.</p>
      ${button(readUrl, 'Read the update', true)}
    `,
  });
}

async function dataExportReady({ firstName, downloadUrl, expiresHours = 24 }) {
  return render({
    subject: 'Your data export is ready',
    headerTitle: 'Export ready',
    body: `
      <h2>Hi ${esc(firstName || 'there')},</h2>
      <p>Your account data export is ready to download.</p>
      ${button(downloadUrl, 'Download Export')}
      <p class="muted">This link expires in ${esc(expiresHours)} hours.</p>
    `,
  });
}

module.exports = {
  verifyEmail,
  welcome,
  passwordReset,
  passwordChanged,
  newDeviceLogin,

  teamMemberInvited,
  teamMemberJoined,
  teamMemberRemoved,
  roleChanged,

  apiKeyCreated,
  apiKeyRevoked,

  domainAdded,
  domainVerified,
  domainVerificationFailed,

  senderAdded,
  senderVerified,

  invoiceCreated,
  paymentReceived,
  paymentConfirmed,
  paymentRejected,
  subscriptionActivated,
  subscriptionRenewed,
  subscriptionExpiring,
  subscriptionExpired,
  subscriptionCancelled,
  invoiceExpiring,
  invoiceExpired,
  planUpgraded,
  planDowngraded,

  quotaWarning,
  quotaExceeded,
  usageReportWeekly,

  adminNewUser,
  adminNewOrganization,
  adminPaymentReceived,
  adminManualPaymentPending,
  adminSubscriptionCancelled,
  adminDomainVerificationFailed,
  adminQuotaExceeded,
  adminNewAdmin,
  adminSystemHealth,
  adminWeeklyDigest,

  broadcastToUser,
  broadcastToAll,

  supportAcknowledged,
  contactConfirmation,
  legalUpdate,
  dataExportReady,
};