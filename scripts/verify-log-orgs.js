require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const hdmId = new mongoose.Types.ObjectId('6a26cea464ad3a3244ef8b3a');
  const dsId = new mongoose.Types.ObjectId('6a7193091af6614e24d9019e');

  const todayStart = new Date('2026-10-01T00:00:00Z');

  console.log('=== Logs since Oct 1, grouped by org ===');
  const byOrg = await db.collection('emaillogs').aggregate([
    { $match: { createdAt: { $gte: todayStart } } },
    { $group: { _id: '$organizationId', count: { $sum: 1 }, newest: { $max: '$createdAt' } } },
    { $sort: { count: -1 } },
  ]).toArray();

  for (const row of byOrg) {
    const org = row._id ? await db.collection('organizations').findOne({ _id: row._id }) : null;
    console.log('  ', row._id ? row._id.toString() : 'null', '->', row.count, 'rows | newest:', row.newest.toISOString(), '|', org?.name || '(unknown)');
  }

  console.log('');
  console.log('=== The 5 most recent logs (any org) ===');
  const recent = await db.collection('emaillogs')
    .find({})
    .sort({ createdAt: -1 })
    .limit(5)
    .project({ organizationId: 1, apiKeyName: 1, subject: 1, createdAt: 1, source: 1 })
    .toArray();

  recent.forEach((r) => {
    const orgName = r.organizationId?.toString() === hdmId.toString() ? 'HDM'
      : r.organizationId?.toString() === dsId.toString() ? 'DigitalSafaris'
      : r.organizationId?.toString() || 'null';
    console.log('  ', new Date(r.createdAt).toISOString(),
      '| org=' + orgName,
      '| src=' + (r.source || '?'),
      '| key=' + (r.apiKeyName || '?'),
      '|', r.subject);
  });

  console.log('');
  console.log('=== HDM org — newest 5 (same as API would return) ===');
  const hdmRecent = await db.collection('emaillogs')
    .find({ organizationId: hdmId })
    .sort({ createdAt: -1 })
    .limit(5)
    .project({ organizationId: 1, apiKeyName: 1, subject: 1, createdAt: 1 })
    .toArray();

  hdmRecent.forEach((r) => {
    console.log('  ', new Date(r.createdAt).toISOString(),
      '| key=' + (r.apiKeyName || '?'),
      '|', r.subject);
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});