import mongoose from 'mongoose';
import Bookmark from './src/models/Bookmark';
import dbConfig from './src/config/secretManagerConfig';
import { ISecretManagerData } from './src/Interfaces/commonInterfaces';

async function fixIndexes() {
    try {
        const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;
        await mongoose.connect(dbData.mongoUri);
        console.log('Connected to MongoDB');

        const collection = Bookmark.collection;

        console.log('Current indexes:');
        const indexes = await collection.indexes();
        console.log(JSON.stringify(indexes, null, 2));

        try {
            console.log('Dropping old indexes...');
            await collection.dropIndex('userId_1_postId_1');
            await collection.dropIndex('userId_1_questionId_1');
            console.log('Old indexes dropped.');
        } catch (e) {
            console.log('Note: Could not drop one or more indexes (they might not exist with those names)');
        }

        console.log('Successfully prepared for index recreation.');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixIndexes();
