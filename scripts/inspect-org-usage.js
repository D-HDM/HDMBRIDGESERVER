require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const ORG_ID = process.argv[2];

if (!ORG_ID) {
  console.error('Usage: node scripts/inspect-org-usage.js <organizationId>');
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const oid = new mongoose.Types.ObjectId(ORG_ID);

  const [apiKeys, domains, senders, templates, users, emailCount] = await Promise.all([
    db.collection('apikeys').countDocuments({ organizationId: oid, isActive: true }),
    db.collection('domains').countDocuments({ organizationId: oid }),
    db.collection('senders').countDocuments({ organizationId: oid }),
    db.collection('templates').countDocuments({ organizationId: oid }),
    db.collection('users').countDocuments({ organizationId: oid, isActive: true }),
    db.collection('emaillogs').countDocuments({ organizationId: oid }),
  ]);

  console.log('API keys (active):', apiKeys, '| Free limit: 2');
  console.log('Domains:          ', domains, '| Free limit: 1');
  console.log('Senders:          ', senders, '| Free limit: 2');
  console.log('Templates:        ', templates, '| Free limit: 5');
  console.log('Team members:     ', users, '| Free limit: 1');
  console.log('Email logs:       ', emailCount);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});