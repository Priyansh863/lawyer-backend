import mongoose from "mongoose";
import dbConfig from "../config/secretManagerConfig";

import { ISecretManagerData } from "../Interfaces/commonInterfaces";

const dataBaseConfig = async () => {
  const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;
  console.log("dbData", dbData);
  mongoose.connect(dbData.mongoUri as string);
  mongoose.connection.on("error", (error) => {
    console.log("error", error);
    throw new Error(`unable to connect to database`);
  });
};

dataBaseConfig();
