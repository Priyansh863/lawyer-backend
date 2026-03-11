
import mongoose from 'mongoose';
import UserActivity from './src/models/user_activity';
import Notification from './src/models/Notification';

const mongoUri = "mongodb+srv://khandelwalpriyansh36:jXRodk8Rp5unMBnz@cluster0.1eyeed2.mongodb.net/lawyer-dev?retryWrites=true&w=majority";

async function checkData() {
    try {
        await mongoose.connect(mongoUri);
        console.log("Connected to MongoDB");

        const activityCount = await UserActivity.countDocuments();
        const notificationCount = await Notification.countDocuments();

        console.log(`Total UserActivity records: ${activityCount}`);
        console.log(`Total Notification records: ${notificationCount}`);

        if (activityCount > 0) {
            const sampleActivities = await UserActivity.find().limit(5);
            console.log("Sample Activities:", JSON.stringify(sampleActivities, null, 2));
        }

        if (notificationCount > 0) {
            const sampleNotifications = await Notification.find().limit(5);
            console.log("Sample Notifications:", JSON.stringify(sampleNotifications, null, 2));
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error("Error:", error);
    }
}

checkData();
