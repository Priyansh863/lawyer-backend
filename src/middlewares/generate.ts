import jwt from "jsonwebtoken";

import { IUserSchema } from "../Interfaces/schemaInterfaces";
import {ISecretManagerData } from "../Interfaces/commonInterfaces";
import dbConfig from "../config/secretManagerConfig";


const createToken = async (user: Partial<IUserSchema>) => {
  const { _id, email, account_type } = user;
  const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;
  return jwt.sign({ _id, email, account_type }, dbData.jwtSecretKey);
};

export default createToken;
