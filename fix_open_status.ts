import mongoose from 'mongoose';
import dbConfig from './src/config/secretManagerConfig';

async function inspectCases() {
  const sm = await dbConfig.secretManagerConnection();
  await mongoose.connect(sm.mongoUri);

  // List all cases with their lawyer_id and status
  const cases = await mongoose.connection.db.collection('cases').find({}).project({
    case_number: 1, title: 1, status: 1, lawyer_id: 1, client_id: 1
  }).toArray();

  console.log(`\nTotal cases in DB: ${cases.length}`);
  cases.forEach(c => {
    console.log(`  ${c.case_number} | status: ${c.status} | lawyer_id: ${c.lawyer_id} | client_id: ${c.client_id}`);
  });

  // List all lawyers
  const lawyers = await mongoose.connection.db.collection('users').find({ account_type: 'lawyer' }).project({
    _id: 1, first_name: 1, last_name: 1, email: 1, account_type: 1
  }).toArray();

  console.log(`\nLawyers in DB: ${lawyers.length}`);
  lawyers.forEach(l => {
    console.log(`  _id: ${l._id} | ${l.first_name} ${l.last_name} | ${l.email}`);
  });

  await mongoose.disconnect();
}

inspectCases().catch(e => { console.error(e); process.exit(1); });
