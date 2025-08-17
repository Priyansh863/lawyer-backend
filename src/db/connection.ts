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
    
    mongoose.connection.once("open", () => {
      console.log("MongoDB connection is open and ready");
    });
    
    return mongoose.connection;
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    throw err;
  }
};

// Export the connection promise so we can await it elsewhere if needed
export const dbConnection = dataBaseConfig();
