import mongoose from "mongoose";
import dbConfig from "../config/secretManagerConfig";

import { ISecretManagerData } from "../Interfaces/commonInterfaces";

const dataBaseConfig = async () => {
  try {
    const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;
    console.log("Connecting to MongoDB...");
    await mongoose.connect(dbData.mongoUri as string);
    console.log("MongoDB connection established successfully");
    
    mongoose.connection.on("error", (error) => {
      console.error("MongoDB connection error:", error);
      throw new Error(`Unable to connect to database: ${error.message}`);
    });
    
    // MIGRATION: Auto-fix legacy string-based 'answer' fields
    try {
      const db = mongoose.connection.db;
      if (db) {
        console.log("[Migration] Checking for malformed Q&A data...");
        // Convert all 'answer' fields that are strings into arrays
        const cursor = db.collection('questions').find({ answer: { $type: "string" } });
        let count = 0;
        while (await cursor.hasNext()) {
          const doc = await cursor.next();
          if (doc && (typeof doc.answer === 'string' && doc.answer.length > 0)) {
            const lawyerId = doc.answeredBy || doc.lawyer_id || null;
            await db.collection('questions').updateOne(
              { _id: doc._id },
              { $set: { 
                  answer: [{
                    lawyer_name: "Legacy Response",
                    lawyer_id: lawyerId,
                    answer: doc.answer,
                    createdAt: doc.answeredAt || doc.updatedAt || new Date()
                  }] 
                } 
              }
            );
            count++;
          }
        }
        if (count > 0) console.log(`[Migration] Fixed ${count} legacy question(s).`);
      }
    } catch (migError) {
      console.warn("[Migration] Skipped or failed:", migError.message);
    }
    
    return mongoose.connection;
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    throw err;
  }
};

// Export the connection promise so we can await it elsewhere if needed
export const dbConnection = dataBaseConfig();
