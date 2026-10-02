require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const hdmId = new mongoose.Types.ObjectId('6a26cea464ad3a3244ef8b3a');
  const dsId = new mongoose.Types.ObjectId('6a7193091af6614e24d9019e');

  const hdmTotal = await db.collection('emaillogs').countDocuments({ organizationId: hdmId });
  const dsTotal = await db.collection('emaillogs').countDocuments({ organizationId: dsId });
  console.log('Totals:');
  console.log('  HDM           ->', hdmTotal);
  console.log('  DigitalSafaris->', dsTotal);

  const rows = await db.collection('emaillogs')
    .find({ organizationId: dsId })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();

  console.log('');
  console.log('DigitalSafaris newest 10 logs:');
  rows.forEach((r) => {
    console.log('  ', new Date(r.createdAt).toISOString(),
      '| src=' + (r.source || '?'),
      '| key=' + (r.apiKeyName || '?'),
      '| from=' + (r.from?.email || '?'),
      '|', r.subject);
  });

  const keys = await db.collection('apikeys')
    .find({ organizationId: dsId })
    .project({ name: 1, prefix: 1, isActive: 1 })
    .toArray();

  console.log('');
  console.log('DigitalSafaris API keys:');
  keys.forEach((k) => {
    console.log('  ', k.name, '| prefix=' + k.prefix, '| active=' + k.isActive);
  });

  const users = await db.collection('users')
    .find({ organizationId: dsId })
    .project({ email: 1, firstName: 1, role: 1 })
    .toArray();

  console.log('');
  console.log('DigitalSafaris users:');
  users.forEach((u) => {
    console.log('  ', u.email, '|', u.firstName, '| role=' + u.role);
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});