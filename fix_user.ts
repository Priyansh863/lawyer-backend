import mongoose from 'mongoose';
import dbConfig from './src/config/secretManagerConfig';

async function fixUser() {
  const sm = await dbConfig.secretManagerConnection();
  await mongoose.connect(sm.mongoUri);

  const result = await mongoose.connection.db.collection('users').updateOne(
    { email: 'new123@gmail.com' },
    { $set: { account_type: 'lawyer' } }
  );
  
  console.log(`Updated user:`, result);

  await mongoose.disconnect();
}

fixUser().catch(e => { console.error(e); process.exit(1); });
