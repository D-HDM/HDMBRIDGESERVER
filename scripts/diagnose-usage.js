require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const orgId = new mongoose.Types.ObjectId('6a26cea464ad3a3244ef8b3a');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const month = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todayByStatus, monthByStatus, todayTotal, monthTotal] = await Promise.all([
    db.collection('emaillogs').aggregate([
      { $match: { organizationId: orgId, createdAt: { $gte: today } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray(),

    db.collection('emaillogs').aggregate([
      { $match: { organizationId: orgId, createdAt: { $gte: month } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray(),

    db.collection('emaillogs').countDocuments({ organizationId: orgId, createdAt: { $gte: today } }),
    db.collection('emaillogs').countDocuments({ organizationId: orgId, createdAt: { $gte: month } }),
  ]);

  console.log('=== TODAY (' + today.toISOString().split('T')[0] + ') ===');
  console.log('Total logs:', todayTotal);
  todayByStatus.forEach((r) => console.log('  ', (r._id || '(null)').padEnd(12), r.count));

  console.log('');
  console.log('=== THIS MONTH (' + month.toISOString().substring(0, 7) + ') ===');
  console.log('Total logs:', monthTotal);
  monthByStatus.forEach((r) => console.log('  ', (r._id || '(null)').padEnd(12), r.count));

  console.log('');
  console.log('=== LAST 10 LOGS TODAY ===');
  const recent = await db.collection('emaillogs')
    .find({ organizationId: orgId, createdAt: { $gte: today } })
    .sort({ createdAt: -1 })
    .limit(10)
    .project({ messageId: 1, subject: 1, status: 1, apiKeyName: 1, 'deliveryDetails.smtpResponse': 1, 'deliveryDetails.attempts': 1, createdAt: 1 })
    .toArray();

  recent.forEach((r) => {
    console.log('  ', new Date(r.createdAt).toISOString(),
      '|', (r.status || '?').padEnd(10),
      '| attempts=' + (r.deliveryDetails?.attempts || 0),
      '|', (r.apiKeyName || '-').padEnd(12),
      '|', r.subject);
    if (r.deliveryDetails?.smtpResponse) {
      console.log('       └─ ' + r.deliveryDetails.smtpResponse.substring(0, 120));
    }
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});