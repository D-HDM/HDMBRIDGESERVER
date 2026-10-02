require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const ORG_ID = process.argv[2];

if (!ORG_ID) {
  console.error('Usage: node scripts/inspect-org.js <organizationId>');
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const subs = await db.collection('subscriptions')
    .find({ organizationId: new mongoose.Types.ObjectId(ORG_ID) })
    .toArray();

  console.log('--- subscriptions ---');
  console.log(JSON.stringify(subs, null, 2));

  const plans = await db.collection('plans')
    .find({ tier: { $in: ['free', 'pro', 'proplus'] } })
    .project({ name: 1, tier: 1, limits: 1, price: 1 })
    .toArray();

  console.log('--- plans ---');
  console.log(JSON.stringify(plans, null, 2));

  const referencedPlan = subs[0]?.planId
    ? await db.collection('plans').findOne({ _id: subs[0].planId })
    : null;

  console.log('--- subscription plan ---');
  console.log(JSON.stringify(referencedPlan, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});