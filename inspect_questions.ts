
import mongoose from 'mongoose';

const mongoUri = "mongodb+srv://khandelwalpriyansh36:jXRodk8Rp5unMBnz@cluster0.1eyeed2.mongodb.net/lawyer-dev?retryWrites=true&w=majority";

async function check() {
    try {
        const conn = await mongoose.createConnection(mongoUri).asPromise();
        console.log("Connected");

        const questions = await conn.db.collection('questions').find({ status: 'answered' }).sort({ updatedAt: -1 }).limit(5).toArray();
        console.log("Recent Answered Questions:", JSON.stringify(questions, null, 2));

        const pending = await conn.db.collection('questions').find({ status: 'pending' }).sort({ createdAt: -1 }).limit(5).toArray();
        console.log("Recent Pending Questions:", JSON.stringify(pending, null, 2));

        await conn.close();
    } catch (err) {
        console.error(err);
    }
}
check();
