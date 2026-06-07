import mongoose from 'mongoose';
import dbConfig from './src/config/secretManagerConfig';

async function checkUser() {
  const sm = await dbConfig.secretManagerConnection();
  await mongoose.connect(sm.mongoUri);

  const user = await mongoose.connection.db.collection('users').findOne({ email: 'new123@gmail.com' });
  console.log('User:', user);
  
  const cases = await mongoose.connection.db.collection('cases').find({ lawyer_id: user?._id }).toArray();
  console.log('Cases for this user:', cases.length);

  await mongoose.disconnect();
}

checkUser().catch(e => { console.error(e); process.exit(1); });
