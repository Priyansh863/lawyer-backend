
import mongoose from 'mongoose';

const mongoUri = "mongodb+srv://khandelwalpriyansh36:jXRodk8Rp5unMBnz@cluster0.1eyeed2.mongodb.net/lawyer-dev?retryWrites=true&w=majority";

async function check() {
    try {
        const conn = await mongoose.createConnection(mongoUri).asPromise();
        console.log("Connected");

        const collections = await conn.db.listCollections().toArray();
        console.log("Collections:", collections.map(c => c.name));

        const notifications = await conn.db.collection('notifications').find().sort({ createdAt: -1 }).limit(5).toArray();
        console.log("Recent Notifications:", JSON.stringify(notifications, null, 2));

        const activities = await conn.db.collection('useractivities').find().limit(5).toArray();
        console.log("Recent Activities:", JSON.stringify(activities, null, 2));

        await conn.close();
    } catch (err) {
        console.error(err);
    }
}
check();
