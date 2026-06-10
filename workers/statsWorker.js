const axios = require('axios');
const EmailLog = require('../models/client/EmailLog');

const BREVO_API_KEY = process.env.BREVO_API_KEY;

async function syncEmailStats() {
  try {
    // Get emails sent in last 24 hours that are still 'sent'
    const sentEmails = await EmailLog.find({
      status: 'sent',
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }).limit(100);

    for (const email of sentEmails) {
      try {
        // Check Brevo for this email's status
        // Note: Brevo free API doesn't support per-message lookup either
        // This is a limitation of free tier
      } catch {}
    }
  } catch (error) {
    console.error('Stats sync error:', error.message);
  }
}

// Run every 10 minutes
setInterval(syncEmailStats, 10 * 60 * 1000);